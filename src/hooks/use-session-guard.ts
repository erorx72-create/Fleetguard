import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const DEVICE_FP_KEY = "fleetguard.deviceFingerprint";
const SESSION_ID_KEY = "fleetguard.sessionId";

function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.localStorage.getItem(DEVICE_FP_KEY);
    if (existing) return existing;
    const generated = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_FP_KEY, generated);
    return generated;
  } catch {
    return "browser-session";
  }
}

function getStoredSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(SESSION_ID_KEY);
  } catch {
    return null;
  }
}

function setStoredSessionId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.sessionStorage.setItem(SESSION_ID_KEY, id);
    else window.sessionStorage.removeItem(SESSION_ID_KEY);
  } catch {
    // ignore storage failures
  }
}

/**
 * Tracks active device sessions and enforces the 2-concurrent-device limit.
 * If a 3rd browser device logs in, the oldest device session is terminated and forced to sign out.
 */
export function useSessionGuard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const signedOutRef = useRef(false);

  useEffect(() => {
    let active = true;

    async function forceSignOut(reason: string) {
      if (signedOutRef.current) return;
      signedOutRef.current = true;
      setStoredSessionId(null);
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
      toast.error(reason);
      navigate({ to: "/auth", replace: true });
    }

    async function registerDeviceSession() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user || !active) return;

      const fp = getDeviceFingerprint();
      const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 240) : undefined;
      const { data, error } = await supabase.rpc("upsert_user_session", {
        _device_fingerprint: fp,
        _ip_address: "client",
        ...(ua ? { _user_agent: ua } : {}),
      });

      if (error || !data?.[0] || !active) return;
      const row = data[0];

      if (row.is_terminated || row.impossible_travel_detected) {
        await forceSignOut("Session terminated for security verification. Please sign in again.");
        return;
      }

      setStoredSessionId(row.session_id);
      if (row.max_sessions_exceeded) {
        toast.info("New device active — oldest session beyond 2 devices was signed out.");
      }
    }

    async function verifySession() {
      const sid = getStoredSessionId();
      if (!sid || signedOutRef.current || !active) return;
      const { data: valid, error } = await supabase.rpc("check_session_valid", {
        _session_id: sid,
      });
      if (!error && valid === false && active) {
        await forceSignOut("Signed out: Your account is active on more than 2 devices.");
      }
    }

    void registerDeviceSession();

    const heartbeatTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void verifySession();
      }
    }, 30_000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void verifySession();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearInterval(heartbeatTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [navigate, qc]);
}

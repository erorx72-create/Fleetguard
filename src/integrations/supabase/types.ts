export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      companies: {
        Row: {
          carrier_status: string | null;
          created_at: string;
          dba_name: string | null;
          dot_number: string | null;
          id: string;
          name: string;
          owner_id: string;
          physical_address: string | null;
          sample_cleared: boolean;
          tier: string;
          trial_started_at: string | null;
          type: string;
        };
        Insert: {
          carrier_status?: string | null;
          created_at?: string;
          dba_name?: string | null;
          dot_number?: string | null;
          id?: string;
          name: string;
          owner_id: string;
          physical_address?: string | null;
          sample_cleared?: boolean;
          tier?: string;
          trial_started_at?: string | null;
          type?: string;
        };
        Update: {
          carrier_status?: string | null;
          created_at?: string;
          dba_name?: string | null;
          dot_number?: string | null;
          id?: string;
          name?: string;
          owner_id?: string;
          physical_address?: string | null;
          sample_cleared?: boolean;
          tier?: string;
          trial_started_at?: string | null;
          type?: string;
        };
        Relationships: [];
      };
      company_members: {
        Row: {
          company_id: string | null;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          member_user_id: string | null;
          owner_id: string;
          role: string;
          status: string;
        };
        Insert: {
          company_id?: string | null;
          created_at?: string;
          email: string;
          full_name: string;
          id?: string;
          member_user_id?: string | null;
          owner_id: string;
          role: string;
          status?: string;
        };
        Update: {
          company_id?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          member_user_id?: string | null;
          owner_id?: string;
          role?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      document_submissions: {
        Row: {
          company_id: string;
          doc_type: Database["public"]["Enums"]["doc_type"];
          driver_id: string;
          file_name: string;
          file_path: string;
          id: string;
          review_status: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          state_of_issuance: string | null;
          submitted_at: string;
        };
        Insert: {
          company_id: string;
          doc_type: Database["public"]["Enums"]["doc_type"];
          driver_id: string;
          file_name: string;
          file_path: string;
          id?: string;
          review_status?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          state_of_issuance?: string | null;
          submitted_at?: string;
        };
        Update: {
          company_id?: string;
          doc_type?: Database["public"]["Enums"]["doc_type"];
          driver_id?: string;
          file_name?: string;
          file_path?: string;
          id?: string;
          review_status?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          state_of_issuance?: string | null;
          submitted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_submissions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_submissions_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          company_id: string;
          doc_type: Database["public"]["Enums"]["doc_type"];
          driver_id: string | null;
          expires_on: string | null;
          file_name: string | null;
          file_path: string | null;
          id: string;
          state_of_issuance: string | null;
          updated_at: string;
          uploaded_at: string | null;
          vehicle_id: string | null;
        };
        Insert: {
          company_id: string;
          doc_type: Database["public"]["Enums"]["doc_type"];
          driver_id?: string | null;
          expires_on?: string | null;
          file_name?: string | null;
          file_path?: string | null;
          id?: string;
          state_of_issuance?: string | null;
          updated_at?: string;
          uploaded_at?: string | null;
          vehicle_id?: string | null;
        };
        Update: {
          company_id?: string;
          doc_type?: Database["public"]["Enums"]["doc_type"];
          driver_id?: string | null;
          expires_on?: string | null;
          file_name?: string | null;
          file_path?: string | null;
          id?: string;
          state_of_issuance?: string | null;
          updated_at?: string;
          uploaded_at?: string | null;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      drivers: {
        Row: {
          company_id: string;
          created_at: string;
          email: string | null;
          full_name: string;
          hire_date: string | null;
          id: string;
          magic_token: string;
          phone: string | null;
          status: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          email?: string | null;
          full_name: string;
          hire_date?: string | null;
          id?: string;
          magic_token?: string;
          phone?: string | null;
          status?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          hire_date?: string | null;
          id?: string;
          magic_token?: string;
          phone?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drivers_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      api_rate_limits: {
        Row: {
          created_at: string;
          id: string;
          ip_address: string;
          request_count: number;
          user_id: string;
          window_start: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          ip_address: string;
          request_count?: number;
          user_id: string;
          window_start?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          ip_address?: string;
          request_count?: number;
          user_id?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      reminders: {
        Row: {
          channel: string;
          company_id: string;
          created_at: string;
          document_id: string;
          id: string;
          sent_to: string | null;
        };
        Insert: {
          channel?: string;
          company_id: string;
          created_at?: string;
          document_id: string;
          id?: string;
          sent_to?: string | null;
        };
        Update: {
          channel?: string;
          company_id?: string;
          created_at?: string;
          document_id?: string;
          id?: string;
          sent_to?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reminders_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reminders_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          billing_cycle_end: string;
          billing_cycle_start: string;
          created_at: string;
          id: string;
          paid_at: string | null;
          plan: string;
          status: string;
          trial_expires_at: string;
          trial_started_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          billing_cycle_end?: string;
          billing_cycle_start?: string;
          created_at?: string;
          id?: string;
          paid_at?: string | null;
          plan?: string;
          status?: string;
          trial_expires_at?: string;
          trial_started_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          billing_cycle_end?: string;
          billing_cycle_start?: string;
          created_at?: string;
          id?: string;
          paid_at?: string | null;
          plan?: string;
          status?: string;
          trial_expires_at?: string;
          trial_started_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      truck_creation_log: {
        Row: {
          billing_cycle_start: string;
          company_id: string;
          created_at: string;
          id: string;
          vehicle_id: string;
        };
        Insert: {
          billing_cycle_start?: string;
          company_id: string;
          created_at?: string;
          id?: string;
          vehicle_id: string;
        };
        Update: {
          billing_cycle_start?: string;
          company_id?: string;
          created_at?: string;
          id?: string;
          vehicle_id?: string;
        };
        Relationships: [];
      };
      truck_quota_counters: {
        Row: {
          billing_cycle_start: string;
          created_at: string;
          id: string;
          owner_id: string;
          trucks_created: number;
          updated_at: string;
        };
        Insert: {
          billing_cycle_start: string;
          created_at?: string;
          id?: string;
          owner_id: string;
          trucks_created?: number;
          updated_at?: string;
        };
        Update: {
          billing_cycle_start?: string;
          created_at?: string;
          id?: string;
          owner_id?: string;
          trucks_created?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_sessions: {
        Row: {
          created_at: string;
          device_fingerprint: string;
          id: string;
          ip_address: string;
          ip_geo: string | null;
          is_terminated: boolean;
          last_active_at: string;
          session_token: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          device_fingerprint: string;
          id?: string;
          ip_address: string;
          ip_geo?: string | null;
          is_terminated?: boolean;
          last_active_at?: string;
          session_token: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          device_fingerprint?: string;
          id?: string;
          ip_address?: string;
          ip_geo?: string | null;
          is_terminated?: boolean;
          last_active_at?: string;
          session_token?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      vehicles: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          kind: string;
          make: string | null;
          model: string | null;
          plate: string | null;
          status: string;
          unit_number: string;
          vin: string | null;
          year: number | null;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          kind?: string;
          make?: string | null;
          model?: string | null;
          plate?: string | null;
          status?: string;
          unit_number: string;
          vin?: string | null;
          year?: number | null;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          make?: string | null;
          model?: string | null;
          plate?: string | null;
          status?: string;
          unit_number?: string;
          vin?: string | null;
          year?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "vehicles_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      _seed_sample_fleet: { Args: { _company: string }; Returns: undefined };
      admin_activate_subscription: {
        Args: { _days?: number; _plan: string; _target_user_id: string };
        Returns: undefined;
      };
      admin_search_accounts: {
        Args: { _query?: string };
        Returns: {
          billing_cycle_end: string | null;
          billing_cycle_start: string | null;
          company_id: string | null;
          company_name: string | null;
          dot_number: string | null;
          email: string;
          full_name: string | null;
          paid_at: string | null;
          plan: string;
          status: string;
          trial_expires_at: string;
          user_created_at: string;
          user_id: string;
        }[];
      };
      approve_document_submission: {
        Args: {
          _expires_on: string;
          _state?: string;
          _submission: string;
          _vehicle?: string;
        };
        Returns: undefined;
      };
      check_rate_limit: {
        Args: { _ip: string; _user_id: string };
        Returns: {
          allowed: boolean;
          remaining: number;
          reset_at: string;
        }[];
      };
      check_session_valid: {
        Args: { _session_id: string };
        Returns: boolean;
      };
      clear_sample_data: {
        Args: { _company: string };
        Returns: undefined;
      };
      configure_company_type: {
        Args: { _company: string; _type: string };
        Returns: undefined;
      };
      create_company: {
        Args: { _dot_number?: string; _name: string; _with_sample?: boolean };
        Returns: string;
      };
      get_subscription_status: {
        Args: Record<string, never>;
        Returns: {
          days_since_creation: number;
          is_locked: boolean;
          is_trial_active: boolean;
          plan: string;
          status: string;
          trial_expires_at: string;
          trial_hours_remaining: number;
          trial_started_at: string;
        }[];
      };
      is_service_or_admin: { Args: Record<string, never>; Returns: boolean };
      is_super_admin: { Args: Record<string, never>; Returns: boolean };
      normalize_dot_number: { Args: { _dot: string }; Returns: string | null };
      owns_company: { Args: { _company: string }; Returns: boolean };
      upsert_user_session: {
        Args: {
          _device_fingerprint: string;
          _ip_address: string;
          _ip_geo?: string;
          _user_agent?: string;
        };
        Returns: {
          impossible_travel_detected: boolean;
          is_terminated: boolean;
          max_sessions_exceeded: boolean;
          session_id: string;
        }[];
      };
    };
    Enums: {
      doc_type:
        | "cdl"
        | "medical_card"
        | "mvr"
        | "drug_test"
        | "annual_inspection"
        | "registration"
        | "insurance";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      doc_type: [
        "cdl",
        "medical_card",
        "mvr",
        "drug_test",
        "annual_inspection",
        "registration",
        "insurance",
      ],
    },
  },
} as const;

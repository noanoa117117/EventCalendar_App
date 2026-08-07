// Hand-written to match supabase/migrations/0001_init.sql. If the schema
// changes, regenerate with `supabase gen types typescript` and keep this
// file's shape (Database.public.Tables.*) so the rest of the app keeps
// compiling against the same names.
//
// Every table needs a `Relationships: []` field (even with no foreign
// keys declared here) - @supabase/postgrest-js's GenericTable requires it,
// and without it the whole `public` schema silently fails its GenericSchema
// constraint, which collapses every query/rpc() argument type to `never`.

export type EventParticipantStatus = "going" | "maybe" | "declined";
export type EventStatus = "published" | "cancelled";
export type AllowedEmailRole = "member" | "admin" | "super_user";

export interface Database {
  public: {
    Tables: {
      allowed_emails: {
        Row: {
          id: string;
          email: string;
          is_enabled: boolean;
          role: AllowedEmailRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          is_enabled?: boolean;
          role?: AllowedEmailRole;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["allowed_emails"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          nickname: string;
          color: string;
          created_at: string;
        };
        Insert: {
          id: string;
          nickname: string;
          color: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      availability_presets: {
        Row: {
          id: string;
          user_id: string;
          label: string;
          start_time: string;
          end_time: string;
          color: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          label: string;
          start_time: string;
          end_time: string;
          color: string;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["availability_presets"]["Insert"]>;
        Relationships: [];
      };
      availability_slots: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          start_time: string;
          end_time: string;
          preset_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          start_time: string;
          end_time: string;
          preset_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["availability_slots"]["Insert"]>;
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          start_at: string;
          end_at: string;
          created_by: string;
          status: EventStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          start_at: string;
          end_at: string;
          created_by: string;
          status?: EventStatus;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Insert"]>;
        Relationships: [];
      };
      event_participants: {
        Row: {
          event_id: string;
          user_id: string;
          status: EventParticipantStatus;
          comment: string | null;
          updated_at: string;
        };
        Insert: {
          event_id: string;
          user_id: string;
          status: EventParticipantStatus;
          comment?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_participants"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_allowed_user: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      setup_profile: {
        Args: { p_nickname: string };
        Returns: Database["public"]["Tables"]["profiles"]["Row"];
      };
      set_availability: {
        Args: {
          p_dates: string[];
          p_start: string;
          p_end: string;
          p_active: boolean;
          p_preset_id?: string | null;
        };
        Returns: void;
      };
      set_availability_batch: {
        Args: { p_operations: Array<{
          dates: string[];
          start: string;
          end: string;
          active: boolean;
          presetId: string | null;
        }> };
        Returns: void;
      };
      current_user_role: { Args: Record<string, never>; Returns: AllowedEmailRole | null };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_super_user: { Args: Record<string, never>; Returns: boolean };
      list_managed_allowed_emails: {
        Args: Record<string, never>;
        Returns: Database["public"]["Tables"]["allowed_emails"]["Row"][];
      };
      manage_allowed_email: {
        Args: { p_email: string; p_role?: AllowedEmailRole; p_enabled?: boolean };
        Returns: Database["public"]["Tables"]["allowed_emails"]["Row"];
      };
      delete_allowed_email: {
        Args: { p_email: string };
        Returns: Database["public"]["Tables"]["allowed_emails"]["Row"];
      };
    };
    Enums: Record<string, never>;
  };
}

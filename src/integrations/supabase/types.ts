export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; name: string; email: string; role: "coach" | "trainee"; coach_id: string | null; created_at: string };
        Insert: { id: string; name?: string; email?: string; role?: "coach" | "trainee"; coach_id?: string | null };
        Update: { name?: string; email?: string; role?: "coach" | "trainee"; coach_id?: string | null };
        Relationships: [];
      };
      blocks: {
        Row: {
          id: string;
          coach_id: string;
          trainee_id: string | null;
          name: string;
          total_weeks: number;
          workouts_per_week: number;
          current_week: number;
          completed_at: number | null;
          weeks: Json;
          primary_configs: Json;
          accessory_configs: Json;
          secondary_configs: Json;
          accessory_group: Json | null;
        };
        Insert: {
          id?: string;
          coach_id: string;
          trainee_id?: string | null;
          name?: string;
          total_weeks?: number;
          workouts_per_week?: number;
          current_week?: number;
          completed_at?: number | null;
          weeks?: Json;
          primary_configs?: Json;
          accessory_configs?: Json;
          secondary_configs?: Json;
          accessory_group?: Json | null;
        };
        Update: {
          id?: string;
          coach_id?: string;
          trainee_id?: string | null;
          name?: string;
          total_weeks?: number;
          workouts_per_week?: number;
          current_week?: number;
          completed_at?: number | null;
          weeks?: Json;
          primary_configs?: Json;
          accessory_configs?: Json;
          secondary_configs?: Json;
          accessory_group?: Json | null;
        };
        Relationships: [];
      };
      block_summaries: {
        Row: {
          id: string;
          block_id: string;
          coach_id: string;
          trainee_id: string;
          block_name: string;
          completed_at: number;
          rows: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          block_id: string;
          coach_id: string;
          trainee_id: string;
          block_name?: string;
          completed_at: number;
          rows?: Json;
        };
        Update: never;
        Relationships: [];
      };
      exercise_library: {
        Row: { id: string; name: string; category: string; created_at: string };
        Insert: { id?: string; name: string; category: string; created_at?: string };
        Update: { name?: string; category?: string };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          to_user_id: string;
          from_user_id: string | null;
          to_role: "coach" | "trainee";
          text: string;
          read: boolean;
          dismissed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          to_user_id: string;
          from_user_id?: string | null;
          to_role: "coach" | "trainee";
          text: string;
          read?: boolean;
          dismissed?: boolean;
          created_at?: string;
        };
        Update: { read?: boolean; dismissed?: boolean };
        Relationships: [];
      };
      invite_codes: {
        Row: { code: string; coach_id: string; used_by: string | null; used_at: string | null };
        Insert: { code: string; coach_id: string };
        Update: never;
        Relationships: [];
      };
      groups: {
        Row: { id: string; coach_id: string; name: string; created_at: string };
        Insert: { id?: string; coach_id: string; name?: string };
        Update: { name?: string };
        Relationships: [];
      };
      group_members: {
        Row: { trainee_id: string; group_id: string; created_at: string };
        Insert: { trainee_id: string; group_id: string };
        Update: never;
        Relationships: [];
      };
      coach_applications: {
        Row: {
          id: string;
          user_id: string;
          full_name: string;
          email: string;
          specialty: string;
          applicant_notes: string;
          status: "pending" | "approved" | "rejected" | "blocked";
          admin_notes: string;
          rejection_reason: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name?: string;
          email?: string;
          specialty?: string;
          applicant_notes?: string;
          status?: "pending" | "approved" | "rejected" | "blocked";
          admin_notes?: string;
          rejection_reason?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
        };
        Update: {
          full_name?: string;
          email?: string;
          specialty?: string;
          applicant_notes?: string;
          status?: "pending" | "approved" | "rejected" | "blocked";
          rejection_reason?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
        };
        Relationships: [];
      };
      admin_logs: {
        Row: {
          id: string;
          admin_id: string;
          action: string;
          target_user_id: string | null;
          notes: string;
          created_at: string;
        };
        Insert: { admin_id: string; action: string; target_user_id?: string | null; notes?: string };
        Update: never;
        Relationships: [];
      };
      user_roles: {
        Row: { id: string; user_id: string; role: "admin" };
        Insert: { user_id: string; role: "admin" };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      redeem_invite_code: { Args: { _code: string }; Returns: string };
      has_system_role: { Args: { _user_id: string; _role: "admin" }; Returns: boolean };
      is_approved_coach: { Args: { _user_id: string }; Returns: boolean };
      coach_remove_trainee: { Args: { _trainee_id: string }; Returns: void };
      admin_delete_user: { Args: { _target_user_id: string }; Returns: void };
    };
    Enums: {
      app_role: "coach" | "trainee";
      coach_status: "pending" | "approved" | "rejected" | "blocked";
    };
    CompositeTypes: Record<string, never>;
  };
};

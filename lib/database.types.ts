export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          created_at: string
          direction: string
          id: number
          market_id: string
          threshold: number
          triggered_at: string | null
          triggered_price: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          direction: string
          id?: never
          market_id: string
          threshold: number
          triggered_at?: string | null
          triggered_price?: number | null
          user_id?: string
        }
        Update: {
          created_at?: string
          direction?: string
          id?: never
          market_id?: string
          threshold?: number
          triggered_at?: string | null
          triggered_price?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_user_id_market_id_fkey"
            columns: ["user_id", "market_id"]
            isOneToOne: false
            referencedRelation: "follows"
            referencedColumns: ["user_id", "market_id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          market_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          market_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          market_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          catalog_seen_at: string
          category: string
          closed: boolean
          closed_at: string | null
          end_date: string | null
          event_id: string | null
          event_title: string | null
          group_item_title: string | null
          id: string
          image: string | null
          in_catalog: boolean
          outcomes: string[]
          places: string[]
          price: number | null
          price_changed_at: string | null
          question: string
          slug: string
          token_id: string
          volume_24h: number | null
        }
        Insert: {
          catalog_seen_at?: string
          category: string
          closed?: boolean
          closed_at?: string | null
          end_date?: string | null
          event_id?: string | null
          event_title?: string | null
          group_item_title?: string | null
          id: string
          image?: string | null
          in_catalog?: boolean
          outcomes: string[]
          places?: string[]
          price?: number | null
          price_changed_at?: string | null
          question: string
          slug: string
          token_id: string
          volume_24h?: number | null
        }
        Update: {
          catalog_seen_at?: string
          category?: string
          closed?: boolean
          closed_at?: string | null
          end_date?: string | null
          event_id?: string | null
          event_title?: string | null
          group_item_title?: string | null
          id?: string
          image?: string | null
          in_catalog?: boolean
          outcomes?: string[]
          places?: string[]
          price?: number | null
          price_changed_at?: string | null
          question?: string
          slug?: string
          token_id?: string
          volume_24h?: number | null
        }
        Relationships: []
      }
      price_history: {
        Row: {
          id: number
          market_id: string
          price: number
          recorded_at: string
        }
        Insert: {
          id?: never
          market_id: string
          price: number
          recorded_at?: string
        }
        Update: {
          id?: never
          market_id?: string
          price?: number
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_history_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      run_lock: {
        Row: {
          holder: string | null
          id: boolean
          locked_until: string
        }
        Insert: {
          holder?: string | null
          id?: boolean
          locked_until?: string
        }
        Update: {
          holder?: string | null
          id?: boolean
          locked_until?: string
        }
        Relationships: []
      }
      visits: {
        Row: {
          last_seen_at: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          user_id?: string
        }
        Update: {
          last_seen_at?: string
          user_id?: string
        }
        Relationships: []
      }
      worker_runs: {
        Row: {
          catalog_refreshed: boolean
          duration_ms: number | null
          error: string | null
          finished_at: string
          id: number
          ok: boolean
          rows_changed: number
          skipped: boolean
          started_at: string
          warnings: string[]
        }
        Insert: {
          catalog_refreshed?: boolean
          duration_ms?: number | null
          error?: string | null
          finished_at?: string
          id?: never
          ok: boolean
          rows_changed?: number
          skipped?: boolean
          started_at: string
          warnings?: string[]
        }
        Update: {
          catalog_refreshed?: boolean
          duration_ms?: number | null
          error?: string | null
          finished_at?: string
          id?: never
          ok?: boolean
          rows_changed?: number
          skipped?: boolean
          started_at?: string
          warnings?: string[]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_prices: { Args: { prices: Json }; Returns: number }
      check_cron_secret: { Args: { candidate: string }; Returns: boolean }
      release_run_lock: { Args: { lock_holder: string }; Returns: undefined }
      try_run_lock: { Args: never; Returns: string }
      upsert_catalog: { Args: { payload: Json }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

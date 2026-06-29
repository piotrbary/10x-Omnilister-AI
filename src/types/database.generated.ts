export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      objects: {
        Row: {
          category: string | null
          created_at: string
          features_text: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          features_text?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          features_text?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      photos: {
        Row: {
          created_at: string
          file_size_bytes: number
          id: string
          mime_type: string
          object_id: string
          original_url: string
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_size_bytes: number
          id?: string
          mime_type: string
          object_id: string
          original_url: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_size_bytes?: number
          id?: string
          mime_type?: string
          object_id?: string
          original_url?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_consent_confirmed_at: string | null
          created_at: string
          id: string
          storage_used_bytes: number
          updated_at: string
        }
        Insert: {
          ai_consent_confirmed_at?: string | null
          created_at?: string
          id: string
          storage_used_bytes?: number
          updated_at?: string
        }
        Update: {
          ai_consent_confirmed_at?: string | null
          created_at?: string
          id?: string
          storage_used_bytes?: number
          updated_at?: string
        }
        Relationships: []
      }
      quality_scores: {
        Row: {
          angle_coverage: number
          background: number
          category: string
          created_at: string
          damage_defects: number
          id: string
          is_sales_ready: boolean
          labels: number
          lighting: number
          object_features: number
          overall_score: number
          photo_id: string
          sales_readiness: number
          scored_at: string
          sharpness: number
          user_id: string
        }
        Insert: {
          angle_coverage: number
          background: number
          category: string
          created_at?: string
          damage_defects: number
          id?: string
          is_sales_ready: boolean
          labels: number
          lighting: number
          object_features: number
          overall_score: number
          photo_id: string
          sales_readiness: number
          scored_at?: string
          sharpness: number
          user_id: string
        }
        Update: {
          angle_coverage?: number
          background?: number
          category?: string
          created_at?: string
          damage_defects?: number
          id?: string
          is_sales_ready?: boolean
          labels?: number
          lighting?: number
          object_features?: number
          overall_score?: number
          photo_id?: string
          sales_readiness?: number
          scored_at?: string
          sharpness?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_scores_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      styles: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          is_reported: boolean
          name: string
          prompt: string
          reporter_user_id: string | null
          updated_at: string
          usage_count: number
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          is_reported?: boolean
          name: string
          prompt: string
          reporter_user_id?: string | null
          updated_at?: string
          usage_count?: number
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          is_reported?: boolean
          name?: string
          prompt?: string
          reporter_user_id?: string | null
          updated_at?: string
          usage_count?: number
          user_id?: string | null
        }
        Relationships: []
      }
      transformations: {
        Row: {
          created_at: string
          error_message: string | null
          feedback: string | null
          id: string
          object_id: string
          photo_id: string
          prompt: string
          result_file_size_bytes: number | null
          result_storage_path: string | null
          result_url: string | null
          retry_count: number
          score_after: Json | null
          score_before: Json | null
          status: string
          style_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          feedback?: string | null
          id?: string
          object_id: string
          photo_id: string
          prompt: string
          result_file_size_bytes?: number | null
          result_storage_path?: string | null
          result_url?: string | null
          retry_count?: number
          score_after?: Json | null
          score_before?: Json | null
          status?: string
          style_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          feedback?: string | null
          id?: string
          object_id?: string
          photo_id?: string
          prompt?: string
          result_file_size_bytes?: number | null
          result_storage_path?: string | null
          result_url?: string | null
          retry_count?: number
          score_after?: Json | null
          score_before?: Json | null
          status?: string
          style_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transformations_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformations_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_style_usage_count: {
        Args: { p_style_id: string }
        Returns: undefined
      }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const


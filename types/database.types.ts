export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type SlideType =
  | "INFO"
  | "MATCHING"
  | "GAP_FILL"
  | "MCQ"
  | "TRUE_FALSE"
  | "OPEN_RESPONSE"
  | "LISTENING"
  | "DISCUSSION"
  | "WRITING"
  | "GAME"
  | "ANSWERS";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: "ADMIN" | "LEARNER";
          cefr_level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: "ADMIN" | "LEARNER";
          cefr_level?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string | null;
          role?: "ADMIN" | "LEARNER";
          cefr_level?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      lessons: {
        Row: {
          id: string;
          title: string;
          topic: string;
          level: string;
          description: string | null;
          pdf_path: string;
          status: "DRAFT" | "PUBLISHED";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          topic: string;
          level?: string;
          description?: string | null;
          pdf_path: string;
          status?: "DRAFT" | "PUBLISHED";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          topic?: string;
          level?: string;
          description?: string | null;
          pdf_path?: string;
          status?: "DRAFT" | "PUBLISHED";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lesson_audio_files: {
        Row: {
          id: string;
          lesson_id: string;
          label: string;
          storage_path: string;
          linked_slide_number: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_id: string;
          label: string;
          storage_path: string;
          linked_slide_number?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lesson_id?: string;
          label?: string;
          storage_path?: string;
          linked_slide_number?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_audio_files_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          }
        ];
      };
      slides: {
        Row: {
          id: string;
          lesson_id: string;
          slide_number: number;
          title: string;
          section_label: string | null;
          raw_text: string;
          type: SlideType;
          linked_answer_slide_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_id: string;
          slide_number: number;
          title: string;
          section_label?: string | null;
          raw_text: string;
          type?: SlideType;
          linked_answer_slide_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lesson_id?: string;
          slide_number?: number;
          title?: string;
          section_label?: string | null;
          raw_text?: string;
          type?: SlideType;
          linked_answer_slide_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "slides_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "slides_linked_answer_slide_id_fkey";
            columns: ["linked_answer_slide_id"];
            isOneToOne: false;
            referencedRelation: "slides";
            referencedColumns: ["id"];
          }
        ];
      };
      slide_activities: {
        Row: {
          id: string;
          lesson_id: string;
          slide_id: string;
          activity_type: string;
          prompt: string;
          items: Json;
          answer_key: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_id: string;
          slide_id: string;
          activity_type: string;
          prompt: string;
          items?: Json;
          answer_key?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lesson_id?: string;
          slide_id?: string;
          activity_type?: string;
          prompt?: string;
          items?: Json;
          answer_key?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "slide_activities_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "slide_activities_slide_id_fkey";
            columns: ["slide_id"];
            isOneToOne: false;
            referencedRelation: "slides";
            referencedColumns: ["id"];
          }
        ];
      };
      lesson_progress: {
        Row: {
          id: string;
          user_id: string;
          lesson_id: string;
          current_slide_number: number;
          completed: boolean;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          lesson_id: string;
          current_slide_number?: number;
          completed?: boolean;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          lesson_id?: string;
          current_slide_number?: number;
          completed?: boolean;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_progress_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      responses: {
        Row: {
          id: string;
          user_id: string;
          lesson_id: string;
          slide_id: string;
          activity_id: string;
          response_data: Json;
          is_correct: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          lesson_id: string;
          slide_id: string;
          activity_id: string;
          response_data?: Json;
          is_correct?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          lesson_id?: string;
          slide_id?: string;
          activity_id?: string;
          response_data?: Json;
          is_correct?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "responses_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "slide_activities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "responses_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "responses_slide_id_fkey";
            columns: ["slide_id"];
            isOneToOne: false;
            referencedRelation: "slides";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "responses_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: "ADMIN" | "LEARNER";
      lesson_status: "DRAFT" | "PUBLISHED";
    };
    CompositeTypes: Record<string, never>;
  };
};

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
      speech_practice_prompts: {
        Row: {
          id: string;
          prompt_type: "SHADOWING" | "TONGUE_TWISTER";
          title: string;
          text: string;
          cefr_level: string | null;
          target_sounds: string[];
          tags: string[];
          audio_variants: Json;
          status: "DRAFT" | "ACTIVE" | "ARCHIVED";
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          prompt_type: "SHADOWING" | "TONGUE_TWISTER";
          title: string;
          text: string;
          cefr_level?: string | null;
          target_sounds?: string[];
          tags?: string[];
          audio_variants?: Json;
          status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          prompt_type?: "SHADOWING" | "TONGUE_TWISTER";
          title?: string;
          text?: string;
          cefr_level?: string | null;
          target_sounds?: string[];
          tags?: string[];
          audio_variants?: Json;
          status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          first_name: string | null;
          last_name: string | null;
          label: string | null;
          bio: string | null;
          social_links: Json;
          avatar_url: string | null;
          role: "ADMIN" | "LEARNER" | "TEACHER" | "SCHOOL_ADMIN";
          cefr_level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          label?: string | null;
          bio?: string | null;
          social_links?: Json;
          avatar_url?: string | null;
          role?: "ADMIN" | "LEARNER" | "TEACHER" | "SCHOOL_ADMIN";
          cefr_level?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          label?: string | null;
          bio?: string | null;
          social_links?: Json;
          avatar_url?: string | null;
          role?: "ADMIN" | "LEARNER" | "TEACHER" | "SCHOOL_ADMIN";
          cefr_level?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      lessons: {
        Row: {
          id: string;
          title: string;
          subtitle: string | null;
          topic: string;
          category: string | null;
          level: string;
          description: string | null;
          thumbnail_path: string | null;
          cover_image_path: string | null;
          duration_minutes: number | null;
          estimated_completion_minutes: number | null;
          timer_minutes: number | null;
          lesson_template: string;
          autoplay_enabled: boolean;
          autoplay_mode: string;
          autoplay_duration_seconds: number;
          pdf_path: string;
          status: "DRAFT" | "PUBLISHED";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          subtitle?: string | null;
          topic: string;
          category?: string | null;
          level?: string;
          description?: string | null;
          thumbnail_path?: string | null;
          cover_image_path?: string | null;
          duration_minutes?: number | null;
          estimated_completion_minutes?: number | null;
          timer_minutes?: number | null;
          lesson_template?: string;
          autoplay_enabled?: boolean;
          autoplay_mode?: string;
          autoplay_duration_seconds?: number;
          pdf_path: string;
          status?: "DRAFT" | "PUBLISHED";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          subtitle?: string | null;
          topic?: string;
          category?: string | null;
          level?: string;
          description?: string | null;
          thumbnail_path?: string | null;
          cover_image_path?: string | null;
          duration_minutes?: number | null;
          estimated_completion_minutes?: number | null;
          timer_minutes?: number | null;
          lesson_template?: string;
          autoplay_enabled?: boolean;
          autoplay_mode?: string;
          autoplay_duration_seconds?: number;
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
          slide_id?: string | null;
          label: string;
          storage_path: string | null;
          storage_provider?: "supabase" | "r2" | "external";
          storage_bucket?: string | null;
          public_url?: string | null;
          source_type?: "RECORDED" | "UPLOADED" | "LINK";
          external_url?: string | null;
          linked_slide_number: number | null;
          duration_seconds: number | null;
          translation_enabled?: boolean;
          narration_language?: "en" | "bn";
          transcript?: string | null;
          glossary?: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_id: string;
          slide_id?: string | null;
          label: string;
          storage_path?: string | null;
          storage_provider?: "supabase" | "r2" | "external";
          storage_bucket?: string | null;
          public_url?: string | null;
          source_type?: "RECORDED" | "UPLOADED" | "LINK";
          external_url?: string | null;
          linked_slide_number?: number | null;
          duration_seconds?: number | null;
          translation_enabled?: boolean;
          narration_language?: "en" | "bn";
          transcript?: string | null;
          glossary?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lesson_id?: string;
          slide_id?: string | null;
          label?: string;
          storage_path?: string | null;
          storage_provider?: "supabase" | "r2" | "external";
          storage_bucket?: string | null;
          public_url?: string | null;
          source_type?: "RECORDED" | "UPLOADED" | "LINK";
          external_url?: string | null;
          linked_slide_number?: number | null;
          duration_seconds?: number | null;
          translation_enabled?: boolean;
          narration_language?: "en" | "bn";
          transcript?: string | null;
          glossary?: Json;
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
          deleted_at: string | null;
          deleted_by: string | null;
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
          deleted_at?: string | null;
          deleted_by?: string | null;
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
          deleted_at?: string | null;
          deleted_by?: string | null;
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
      lesson_blocks: {
        Row: {
          id: string;
          lesson_id: string;
          slide_id: string;
          position: number;
          block_type: string;
          content: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_id: string;
          slide_id: string;
          position: number;
          block_type: string;
          content?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lesson_id?: string;
          slide_id?: string;
          position?: number;
          block_type?: string;
          content?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_blocks_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_blocks_slide_id_fkey";
            columns: ["slide_id"];
            isOneToOne: false;
            referencedRelation: "slides";
            referencedColumns: ["id"];
          }
        ];
      };
      content_library_items: {
        Row: {
          id: string;
          item_type: "QUESTION" | "ACTIVITY" | "LESSON_BLOCK" | "SLIDE" | "LESSON" | "COURSE_TEMPLATE";
          title: string;
          description: string | null;
          level: string | null;
          skill: string | null;
          topic: string | null;
          activity_type: string | null;
          source_type: string;
          source_id: string | null;
          source_parent_id: string | null;
          source_title: string | null;
          source_metadata: Json;
          content_snapshot: Json;
          created_by: string | null;
          organization_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          item_type: "QUESTION" | "ACTIVITY" | "LESSON_BLOCK" | "SLIDE" | "LESSON" | "COURSE_TEMPLATE";
          title: string;
          description?: string | null;
          level?: string | null;
          skill?: string | null;
          topic?: string | null;
          activity_type?: string | null;
          source_type: string;
          source_id?: string | null;
          source_parent_id?: string | null;
          source_title?: string | null;
          source_metadata?: Json;
          content_snapshot: Json;
          created_by?: string | null;
          organization_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          item_type?: "QUESTION" | "ACTIVITY" | "LESSON_BLOCK" | "SLIDE" | "LESSON" | "COURSE_TEMPLATE";
          title?: string;
          description?: string | null;
          level?: string | null;
          skill?: string | null;
          topic?: string | null;
          activity_type?: string | null;
          source_type?: string;
          source_id?: string | null;
          source_parent_id?: string | null;
          source_title?: string | null;
          source_metadata?: Json;
          content_snapshot?: Json;
          created_by?: string | null;
          organization_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      content_reuse_events: {
        Row: {
          id: string;
          library_item_id: string;
          copied_by: string | null;
          destination_type: string;
          destination_id: string | null;
          destination_parent_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          library_item_id: string;
          copied_by?: string | null;
          destination_type: string;
          destination_id?: string | null;
          destination_parent_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          library_item_id?: string;
          copied_by?: string | null;
          destination_type?: string;
          destination_id?: string | null;
          destination_parent_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      lesson_phase_items: {
        Row: {
          id: string;
          lesson_id: string;
          slide_id: string;
          phase: "LEARN" | "PRACTICE";
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_id: string;
          slide_id: string;
          phase: "LEARN" | "PRACTICE";
          position: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lesson_id?: string;
          slide_id?: string;
          phase?: "LEARN" | "PRACTICE";
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lesson_practice_learn_links: {
        Row: {
          lesson_id: string;
          practice_item_id: string;
          learn_item_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          lesson_id: string;
          practice_item_id: string;
          learn_item_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          lesson_id?: string;
          practice_item_id?: string;
          learn_item_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lesson_progress: {
        Row: {
          id: string;
          user_id: string;
          lesson_id: string;
          current_slide_number: number;
          completed: boolean;
          notes: string;
          current_phase_item_id: string | null;
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
          current_phase_item_id?: string | null;
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
          current_phase_item_id?: string | null;
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
      courses: {
        Row: {
          id: string;
          title: string;
          subtitle: string | null;
          slug: string | null;
          description: string | null;
          topic: string | null;
          category: string | null;
          level: string;
          thumbnail_path: string | null;
          cover_image_path: string | null;
          duration_minutes: number | null;
          estimated_completion_minutes: number | null;
          status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
          created_by: string | null;
          owner_id: string | null;
          organization_id: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          created_at: string;
          updated_at: string;
          price_bdt: number | null;
          original_price_bdt: number | null;
          payment_instructions: string | null;
          visibility: "PUBLIC" | "PRIVATE";
        };
        Insert: {
          id?: string;
          title: string;
          subtitle?: string | null;
          slug?: string | null;
          description?: string | null;
          topic?: string | null;
          category?: string | null;
          level?: string;
          thumbnail_path?: string | null;
          cover_image_path?: string | null;
          duration_minutes?: number | null;
          estimated_completion_minutes?: number | null;
          status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
          created_by?: string | null;
          owner_id?: string | null;
          organization_id?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
          price_bdt?: number | null;
          original_price_bdt?: number | null;
          payment_instructions?: string | null;
          visibility?: "PUBLIC" | "PRIVATE";
        };
        Update: {
          id?: string;
          title?: string;
          subtitle?: string | null;
          slug?: string | null;
          description?: string | null;
          topic?: string | null;
          category?: string | null;
          level?: string;
          thumbnail_path?: string | null;
          cover_image_path?: string | null;
          duration_minutes?: number | null;
          estimated_completion_minutes?: number | null;
          status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
          created_by?: string | null;
          owner_id?: string | null;
          organization_id?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
          price_bdt?: number | null;
          original_price_bdt?: number | null;
          payment_instructions?: string | null;
          visibility?: "PUBLIC" | "PRIVATE";
        };
        Relationships: [];
      };
      course_orders: {
        Row: {
          id: string;
          user_id: string;
          course_id: string;
          status: "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";
          amount_bdt: number;
          payment_method: "BKASH" | "NAGAD" | "BANK_TRANSFER" | "OTHER";
          transaction_id: string | null;
          sender_number: string | null;
          receipt_path: string | null;
          note: string | null;
          admin_note: string | null;
          confirmed_by: string | null;
          confirmed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          course_id: string;
          status?: "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";
          amount_bdt: number;
          payment_method: "BKASH" | "NAGAD" | "BANK_TRANSFER" | "OTHER";
          transaction_id?: string | null;
          sender_number?: string | null;
          receipt_path?: string | null;
          note?: string | null;
          admin_note?: string | null;
          confirmed_by?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          course_id?: string;
          status?: "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";
          amount_bdt?: number;
          payment_method?: "BKASH" | "NAGAD" | "BANK_TRANSFER" | "OTHER";
          transaction_id?: string | null;
          sender_number?: string | null;
          receipt_path?: string | null;
          note?: string | null;
          admin_note?: string | null;
          confirmed_by?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      course_outcomes: {
        Row: { id: string; course_id: string; position: number; outcome: string; created_at: string };
        Insert: { id?: string; course_id: string; position?: number; outcome: string; created_at?: string };
        Update: { id?: string; course_id?: string; position?: number; outcome?: string; created_at?: string };
        Relationships: [];
      };
      course_faqs: {
        Row: { id: string; course_id: string; position: number; question: string; answer: string; created_at: string };
        Insert: { id?: string; course_id: string; position?: number; question: string; answer: string; created_at?: string };
        Update: { id?: string; course_id?: string; position?: number; question?: string; answer?: string; created_at?: string };
        Relationships: [];
      };
      course_sections: {
        Row: { id: string; course_id: string; position: number; title: string; description: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; course_id: string; position?: number; title: string; description?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; course_id?: string; position?: number; title?: string; description?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      course_items: {
        Row: {
          id: string;
          course_id: string;
          section_id: string | null;
          position: number;
          item_type: "LESSON" | "QUIZ" | "LEVEL_TEST" | "RESOURCE" | "EXTERNAL_LINK";
          lesson_id: string | null;
          quiz_id: string | null;
          title: string | null;
          description: string | null;
          resource_url: string | null;
          is_required: boolean;
          is_free_preview: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          section_id?: string | null;
          position?: number;
          item_type: "LESSON" | "QUIZ" | "LEVEL_TEST" | "RESOURCE" | "EXTERNAL_LINK";
          lesson_id?: string | null;
          quiz_id?: string | null;
          title?: string | null;
          description?: string | null;
          resource_url?: string | null;
          is_required?: boolean;
          is_free_preview?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          section_id?: string | null;
          position?: number;
          item_type?: "LESSON" | "QUIZ" | "LEVEL_TEST" | "RESOURCE" | "EXTERNAL_LINK";
          lesson_id?: string | null;
          quiz_id?: string | null;
          title?: string | null;
          description?: string | null;
          resource_url?: string | null;
          is_required?: boolean;
          is_free_preview?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      course_enrollments: {
        Row: { id: string; user_id: string; course_id: string; status: "ACTIVE" | "COMPLETED" | "CANCELLED"; enrolled_at: string; completed_at: string | null };
        Insert: { id?: string; user_id: string; course_id: string; status?: "ACTIVE" | "COMPLETED" | "CANCELLED"; enrolled_at?: string; completed_at?: string | null };
        Update: { id?: string; user_id?: string; course_id?: string; status?: "ACTIVE" | "COMPLETED" | "CANCELLED"; enrolled_at?: string; completed_at?: string | null };
        Relationships: [];
      };
      course_progress: {
        Row: { id: string; user_id: string; course_id: string; current_item_id: string | null; completed_items: number; total_items: number; progress_percent: number; updated_at: string };
        Insert: { id?: string; user_id: string; course_id: string; current_item_id?: string | null; completed_items?: number; total_items?: number; progress_percent?: number; updated_at?: string };
        Update: { id?: string; user_id?: string; course_id?: string; current_item_id?: string | null; completed_items?: number; total_items?: number; progress_percent?: number; updated_at?: string };
        Relationships: [];
      };
      course_item_progress: {
        Row: { id: string; user_id: string; course_id: string; course_item_id: string; completed: boolean; completed_at: string | null; updated_at: string };
        Insert: { id?: string; user_id: string; course_id: string; course_item_id: string; completed?: boolean; completed_at?: string | null; updated_at?: string };
        Update: { id?: string; user_id?: string; course_id?: string; course_item_id?: string; completed?: boolean; completed_at?: string | null; updated_at?: string };
        Relationships: [];
      };
      organizations: {
        Row: { id: string; name: string; slug: string | null; description: string | null; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; slug?: string | null; description?: string | null; created_by?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; name?: string; slug?: string | null; description?: string | null; created_by?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      organization_members: {
        Row: { id: string; organization_id: string; user_id: string; role: "OWNER" | "SCHOOL_ADMIN" | "TEACHER" | "STUDENT" | "MEMBER"; created_at: string };
        Insert: { id?: string; organization_id: string; user_id: string; role?: "OWNER" | "SCHOOL_ADMIN" | "TEACHER" | "STUDENT" | "MEMBER"; created_at?: string };
        Update: { id?: string; organization_id?: string; user_id?: string; role?: "OWNER" | "SCHOOL_ADMIN" | "TEACHER" | "STUDENT" | "MEMBER"; created_at?: string };
        Relationships: [];
      };
      classes: {
        Row: { id: string; organization_id: string | null; name: string; description: string | null; level: string | null; teacher_id: string | null; status: "ACTIVE" | "ARCHIVED"; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; organization_id?: string | null; name: string; description?: string | null; level?: string | null; teacher_id?: string | null; status?: "ACTIVE" | "ARCHIVED"; created_by?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; organization_id?: string | null; name?: string; description?: string | null; level?: string | null; teacher_id?: string | null; status?: "ACTIVE" | "ARCHIVED"; created_by?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      class_members: {
        Row: { id: string; class_id: string; user_id: string; role: "TEACHER" | "STUDENT"; joined_at: string };
        Insert: { id?: string; class_id: string; user_id: string; role?: "TEACHER" | "STUDENT"; joined_at?: string };
        Update: { id?: string; class_id?: string; user_id?: string; role?: "TEACHER" | "STUDENT"; joined_at?: string };
        Relationships: [];
      };
      class_assignments: {
        Row: {
          id: string;
          class_id: string;
          item_type: "COURSE" | "LESSON" | "QUIZ" | "LEVEL_TEST";
          course_id: string | null;
          lesson_id: string | null;
          quiz_id: string | null;
          title: string | null;
          due_at: string | null;
          required_score: number | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          class_id: string;
          item_type: "COURSE" | "LESSON" | "QUIZ" | "LEVEL_TEST";
          course_id?: string | null;
          lesson_id?: string | null;
          quiz_id?: string | null;
          title?: string | null;
          due_at?: string | null;
          required_score?: number | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          class_id?: string;
          item_type?: "COURSE" | "LESSON" | "QUIZ" | "LEVEL_TEST";
          course_id?: string | null;
          lesson_id?: string | null;
          quiz_id?: string | null;
          title?: string | null;
          due_at?: string | null;
          required_score?: number | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      practice_tasks: {
        Row: { id: string; learner_id: string; created_by: string | null; class_id: string | null; title: string; description: string | null; task_type: "PRACTICE" | "SELF_STUDY" | "REMINDER" | "HOMEWORK"; priority: "LOW" | "NORMAL" | "HIGH"; status: "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"; due_at: string | null; estimated_minutes: number | null; completed_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; learner_id: string; created_by?: string | null; class_id?: string | null; title: string; description?: string | null; task_type?: "PRACTICE" | "SELF_STUDY" | "REMINDER" | "HOMEWORK"; priority?: "LOW" | "NORMAL" | "HIGH"; status?: "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"; due_at?: string | null; estimated_minutes?: number | null; completed_at?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; learner_id?: string; created_by?: string | null; class_id?: string | null; title?: string; description?: string | null; task_type?: "PRACTICE" | "SELF_STUDY" | "REMINDER" | "HOMEWORK"; priority?: "LOW" | "NORMAL" | "HIGH"; status?: "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"; due_at?: string | null; estimated_minutes?: number | null; completed_at?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      course_certificates: {
        Row: { id: string; user_id: string; course_id: string; certificate_code: string; issued_at: string };
        Insert: { id?: string; user_id: string; course_id: string; certificate_code: string; issued_at?: string };
        Update: { id?: string; user_id?: string; course_id?: string; certificate_code?: string; issued_at?: string };
        Relationships: [];
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
      user_role: "ADMIN" | "LEARNER" | "TEACHER" | "SCHOOL_ADMIN";
      lesson_status: "DRAFT" | "PUBLISHED";
    };
    CompositeTypes: Record<string, never>;
  };
};

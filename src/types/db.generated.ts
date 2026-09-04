export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      academy_cases: {
        Row: {
          ai_summary: string | null;
          anonymized: boolean;
          category: string;
          caution_points: Json;
          certificate_id: string | null;
          created_at: string;
          difficulty: number;
          good_points: Json;
          helpful_count: number;
          id: string;
          is_candidate: boolean;
          is_published: boolean;
          photos: Json;
          published_at: string | null;
          published_by: string | null;
          quality_score: number;
          tags: string[];
          tenant_id: string;
          updated_at: string;
          vehicle_info: Json;
          view_count: number;
        };
        Insert: {
          ai_summary?: string | null;
          anonymized?: boolean;
          category: string;
          caution_points?: Json;
          certificate_id?: string | null;
          created_at?: string;
          difficulty?: number;
          good_points?: Json;
          helpful_count?: number;
          id?: string;
          is_candidate?: boolean;
          is_published?: boolean;
          photos?: Json;
          published_at?: string | null;
          published_by?: string | null;
          quality_score?: number;
          tags?: string[];
          tenant_id: string;
          updated_at?: string;
          vehicle_info?: Json;
          view_count?: number;
        };
        Update: {
          ai_summary?: string | null;
          anonymized?: boolean;
          category?: string;
          caution_points?: Json;
          certificate_id?: string | null;
          created_at?: string;
          difficulty?: number;
          good_points?: Json;
          helpful_count?: number;
          id?: string;
          is_candidate?: boolean;
          is_published?: boolean;
          photos?: Json;
          published_at?: string | null;
          published_by?: string | null;
          quality_score?: number;
          tags?: string[];
          tenant_id?: string;
          updated_at?: string;
          vehicle_info?: Json;
          view_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "academy_cases_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
        ];
      };
      academy_creator_rewards: {
        Row: {
          applied_at: string | null;
          author_user_id: string;
          created_at: string;
          id: string;
          lesson_count: number;
          notes: string | null;
          period_month: string;
          qualifying_lessons: Json;
          reward_per_lesson: number;
          status: string;
          stripe_credit_id: string | null;
          tenant_id: string | null;
          total_amount_jpy: number;
        };
        Insert: {
          applied_at?: string | null;
          author_user_id: string;
          created_at?: string;
          id?: string;
          lesson_count?: number;
          notes?: string | null;
          period_month: string;
          qualifying_lessons?: Json;
          reward_per_lesson?: number;
          status?: string;
          stripe_credit_id?: string | null;
          tenant_id?: string | null;
          total_amount_jpy?: number;
        };
        Update: {
          applied_at?: string | null;
          author_user_id?: string;
          created_at?: string;
          id?: string;
          lesson_count?: number;
          notes?: string | null;
          period_month?: string;
          qualifying_lessons?: Json;
          reward_per_lesson?: number;
          status?: string;
          stripe_credit_id?: string | null;
          tenant_id?: string | null;
          total_amount_jpy?: number;
        };
        Relationships: [
          {
            foreignKeyName: "academy_creator_rewards_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      academy_lesson_completions: {
        Row: {
          completed_at: string;
          id: string;
          lesson_id: string;
          score_earned: number;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string;
          id?: string;
          lesson_id: string;
          score_earned?: number;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          completed_at?: string;
          id?: string;
          lesson_id?: string;
          score_earned?: number;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "academy_lesson_completions_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "academy_lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      academy_lesson_ratings: {
        Row: {
          comment: string | null;
          created_at: string;
          id: string;
          lesson_id: string;
          rating: number;
          tenant_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          comment?: string | null;
          created_at?: string;
          id?: string;
          lesson_id: string;
          rating: number;
          tenant_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          comment?: string | null;
          created_at?: string;
          id?: string;
          lesson_id?: string;
          rating?: number;
          tenant_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "academy_lesson_ratings_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "academy_lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      academy_lessons: {
        Row: {
          author_user_id: string | null;
          body: string;
          category: string;
          cover_image_url: string | null;
          created_at: string;
          difficulty: number;
          id: string;
          level: string;
          published_at: string | null;
          rating_avg: number;
          rating_count: number;
          status: string;
          summary: string | null;
          tags: string[];
          tenant_id: string | null;
          title: string;
          updated_at: string;
          video_asset_id: string | null;
          video_duration_sec: number | null;
          video_playback_id: string | null;
          video_provider: string | null;
          video_provider_metadata: Json;
          video_status: string | null;
          video_url: string | null;
          view_count: number;
        };
        Insert: {
          author_user_id?: string | null;
          body?: string;
          category: string;
          cover_image_url?: string | null;
          created_at?: string;
          difficulty?: number;
          id?: string;
          level?: string;
          published_at?: string | null;
          rating_avg?: number;
          rating_count?: number;
          status?: string;
          summary?: string | null;
          tags?: string[];
          tenant_id?: string | null;
          title: string;
          updated_at?: string;
          video_asset_id?: string | null;
          video_duration_sec?: number | null;
          video_playback_id?: string | null;
          video_provider?: string | null;
          video_provider_metadata?: Json;
          video_status?: string | null;
          video_url?: string | null;
          view_count?: number;
        };
        Update: {
          author_user_id?: string | null;
          body?: string;
          category?: string;
          cover_image_url?: string | null;
          created_at?: string;
          difficulty?: number;
          id?: string;
          level?: string;
          published_at?: string | null;
          rating_avg?: number;
          rating_count?: number;
          status?: string;
          summary?: string | null;
          tags?: string[];
          tenant_id?: string | null;
          title?: string;
          updated_at?: string;
          video_asset_id?: string | null;
          video_duration_sec?: number | null;
          video_playback_id?: string | null;
          video_provider?: string | null;
          video_provider_metadata?: Json;
          video_status?: string | null;
          video_url?: string | null;
          view_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "academy_lessons_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      academy_progress: {
        Row: {
          badges: string[];
          cases_submitted: number;
          certs_reviewed: number;
          created_at: string;
          id: string;
          last_activity_at: string | null;
          lessons_completed: number;
          level: number;
          standard_level: string;
          tenant_id: string;
          total_score: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          badges?: string[];
          cases_submitted?: number;
          certs_reviewed?: number;
          created_at?: string;
          id?: string;
          last_activity_at?: string | null;
          lessons_completed?: number;
          level?: number;
          standard_level?: string;
          tenant_id: string;
          total_score?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          badges?: string[];
          cases_submitted?: number;
          certs_reviewed?: number;
          created_at?: string;
          id?: string;
          last_activity_at?: string | null;
          lessons_completed?: number;
          level?: number;
          standard_level?: string;
          tenant_id?: string;
          total_score?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      academy_quiz_attempts: {
        Row: {
          answers: Json;
          attempted_at: string;
          id: string;
          lesson_id: string;
          passed: boolean;
          score: number;
          tenant_id: string;
          total: number;
          user_id: string;
        };
        Insert: {
          answers?: Json;
          attempted_at?: string;
          id?: string;
          lesson_id: string;
          passed?: boolean;
          score?: number;
          tenant_id: string;
          total?: number;
          user_id: string;
        };
        Update: {
          answers?: Json;
          attempted_at?: string;
          id?: string;
          lesson_id?: string;
          passed?: boolean;
          score?: number;
          tenant_id?: string;
          total?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "academy_quiz_attempts_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "academy_lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      academy_quiz_questions: {
        Row: {
          choices: string[];
          correct_index: number;
          created_at: string;
          explanation: string | null;
          id: string;
          lesson_id: string;
          position: number;
          question: string;
          updated_at: string;
        };
        Insert: {
          choices: string[];
          correct_index: number;
          created_at?: string;
          explanation?: string | null;
          id?: string;
          lesson_id: string;
          position?: number;
          question: string;
          updated_at?: string;
        };
        Update: {
          choices?: string[];
          correct_index?: number;
          created_at?: string;
          explanation?: string | null;
          id?: string;
          lesson_id?: string;
          position?: number;
          question?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "academy_quiz_questions_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "academy_lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      accounting_integrations: {
        Row: {
          access_token_ciphertext: string | null;
          auto_sync_enabled: boolean;
          connected_at: string | null;
          connected_by: string | null;
          created_at: string;
          default_partner_id: string | null;
          default_sales_account_id: string | null;
          default_sales_account_name: string | null;
          default_tax_code: string | null;
          default_tax_rate: number | null;
          external_company_id: string | null;
          external_company_name: string | null;
          id: string;
          last_error: string | null;
          last_synced_at: string | null;
          provider: string;
          refresh_token_ciphertext: string | null;
          status: string;
          tenant_id: string;
          token_expires_at: string | null;
          updated_at: string;
        };
        Insert: {
          access_token_ciphertext?: string | null;
          auto_sync_enabled?: boolean;
          connected_at?: string | null;
          connected_by?: string | null;
          created_at?: string;
          default_partner_id?: string | null;
          default_sales_account_id?: string | null;
          default_sales_account_name?: string | null;
          default_tax_code?: string | null;
          default_tax_rate?: number | null;
          external_company_id?: string | null;
          external_company_name?: string | null;
          id?: string;
          last_error?: string | null;
          last_synced_at?: string | null;
          provider: string;
          refresh_token_ciphertext?: string | null;
          status?: string;
          tenant_id: string;
          token_expires_at?: string | null;
          updated_at?: string;
        };
        Update: {
          access_token_ciphertext?: string | null;
          auto_sync_enabled?: boolean;
          connected_at?: string | null;
          connected_by?: string | null;
          created_at?: string;
          default_partner_id?: string | null;
          default_sales_account_id?: string | null;
          default_sales_account_name?: string | null;
          default_tax_code?: string | null;
          default_tax_rate?: number | null;
          external_company_id?: string | null;
          external_company_name?: string | null;
          id?: string;
          last_error?: string | null;
          last_synced_at?: string | null;
          provider?: string;
          refresh_token_ciphertext?: string | null;
          status?: string;
          tenant_id?: string;
          token_expires_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "accounting_integrations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      accounting_sync_records: {
        Row: {
          amount: number | null;
          attempt_count: number;
          created_at: string;
          error_message: string | null;
          external_id: string | null;
          id: string;
          provider: string;
          source_id: string;
          source_type: string;
          status: string;
          synced_at: string | null;
          tax_amount: number | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          amount?: number | null;
          attempt_count?: number;
          created_at?: string;
          error_message?: string | null;
          external_id?: string | null;
          id?: string;
          provider: string;
          source_id: string;
          source_type: string;
          status?: string;
          synced_at?: string | null;
          tax_amount?: number | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number | null;
          attempt_count?: number;
          created_at?: string;
          error_message?: string | null;
          external_id?: string | null;
          id?: string;
          provider?: string;
          source_id?: string;
          source_type?: string;
          status?: string;
          synced_at?: string | null;
          tax_amount?: number | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "accounting_sync_records_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      accounting_sync_runs: {
        Row: {
          created_at: string;
          errors_json: Json;
          finished_at: string | null;
          id: string;
          provider: string;
          records_attempted: number;
          records_failed: number;
          records_skipped: number;
          records_synced: number;
          started_at: string;
          status: string;
          tenant_id: string;
          trigger_type: string;
          triggered_by: string | null;
        };
        Insert: {
          created_at?: string;
          errors_json?: Json;
          finished_at?: string | null;
          id?: string;
          provider: string;
          records_attempted?: number;
          records_failed?: number;
          records_skipped?: number;
          records_synced?: number;
          started_at?: string;
          status?: string;
          tenant_id: string;
          trigger_type: string;
          triggered_by?: string | null;
        };
        Update: {
          created_at?: string;
          errors_json?: Json;
          finished_at?: string | null;
          id?: string;
          provider?: string;
          records_attempted?: number;
          records_failed?: number;
          records_skipped?: number;
          records_synced?: number;
          started_at?: string;
          status?: string;
          tenant_id?: string;
          trigger_type?: string;
          triggered_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "accounting_sync_runs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_audit_logs: {
        Row: {
          action: string;
          actor_id: string;
          after_data: Json | null;
          before_data: Json | null;
          created_at: string;
          id: string;
          ip: string | null;
          meta: Json | null;
          target_id: string | null;
          target_type: string;
          user_agent: string | null;
        };
        Insert: {
          action: string;
          actor_id: string;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          id?: string;
          ip?: string | null;
          meta?: Json | null;
          target_id?: string | null;
          target_type: string;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          id?: string;
          ip?: string | null;
          meta?: Json | null;
          target_id?: string | null;
          target_type?: string;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      agent_announcement_reads: {
        Row: {
          announcement_id: string;
          id: string;
          read_at: string;
          user_id: string;
        };
        Insert: {
          announcement_id: string;
          id?: string;
          read_at?: string;
          user_id: string;
        };
        Update: {
          announcement_id?: string;
          id?: string;
          read_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_announcement_reads_announcement_id_fkey";
            columns: ["announcement_id"];
            isOneToOne: false;
            referencedRelation: "agent_announcements";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_announcements: {
        Row: {
          body: string;
          category: string;
          created_at: string;
          created_by: string | null;
          id: string;
          is_pinned: boolean;
          published_at: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_pinned?: boolean;
          published_at?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_pinned?: boolean;
          published_at?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_applications: {
        Row: {
          address: string;
          agent_id: string | null;
          application_number: string;
          company_name: string;
          contact_name: string;
          created_at: string;
          documents: Json;
          email: string;
          id: string;
          industry: string;
          ip_address: string | null;
          phone: string;
          qualifications: string;
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          track_record: string;
          updated_at: string;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          address: string;
          agent_id?: string | null;
          application_number: string;
          company_name: string;
          contact_name: string;
          created_at?: string;
          documents?: Json;
          email: string;
          id?: string;
          industry?: string;
          ip_address?: string | null;
          phone: string;
          qualifications?: string;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          track_record?: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          address?: string;
          agent_id?: string | null;
          application_number?: string;
          company_name?: string;
          contact_name?: string;
          created_at?: string;
          documents?: Json;
          email?: string;
          id?: string;
          industry?: string;
          ip_address?: string | null;
          phone?: string;
          qualifications?: string;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          track_record?: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agent_applications_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_campaign_agents: {
        Row: {
          agent_id: string;
          campaign_id: string;
        };
        Insert: {
          agent_id: string;
          campaign_id: string;
        };
        Update: {
          agent_id?: string;
          campaign_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_campaign_agents_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_campaign_agents_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "agent_campaigns";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_campaigns: {
        Row: {
          banner_text: string | null;
          bonus_fixed: number | null;
          bonus_rate: number | null;
          campaign_type: string;
          created_at: string;
          description: string | null;
          end_date: string;
          id: string;
          is_active: boolean;
          start_date: string;
          target_agents: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          banner_text?: string | null;
          bonus_fixed?: number | null;
          bonus_rate?: number | null;
          campaign_type?: string;
          created_at?: string;
          description?: string | null;
          end_date: string;
          id?: string;
          is_active?: boolean;
          start_date: string;
          target_agents?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          banner_text?: string | null;
          bonus_fixed?: number | null;
          bonus_rate?: number | null;
          campaign_type?: string;
          created_at?: string;
          description?: string | null;
          end_date?: string;
          id?: string;
          is_active?: boolean;
          start_date?: string;
          target_agents?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_commissions: {
        Row: {
          agent_id: string;
          amount: number;
          base_amount: number;
          commission_rate: number;
          commission_type: string;
          created_at: string;
          currency: string;
          id: string;
          notes: string | null;
          paid_at: string | null;
          period_end: string;
          period_start: string;
          referral_id: string;
          source_invoice_id: string | null;
          status: string;
          stripe_transfer_id: string | null;
          tenant_id: string | null;
          updated_at: string;
        };
        Insert: {
          agent_id: string;
          amount?: number;
          base_amount?: number;
          commission_rate: number;
          commission_type?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          notes?: string | null;
          paid_at?: string | null;
          period_end: string;
          period_start: string;
          referral_id: string;
          source_invoice_id?: string | null;
          status?: string;
          stripe_transfer_id?: string | null;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          agent_id?: string;
          amount?: number;
          base_amount?: number;
          commission_rate?: number;
          commission_type?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          notes?: string | null;
          paid_at?: string | null;
          period_end?: string;
          period_start?: string;
          referral_id?: string;
          source_invoice_id?: string | null;
          status?: string;
          stripe_transfer_id?: string | null;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_commissions_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_commissions_referral_id_fkey";
            columns: ["referral_id"];
            isOneToOne: false;
            referencedRelation: "agent_referrals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_commissions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_faq_categories: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      agent_faqs: {
        Row: {
          answer: string;
          category_id: string;
          created_at: string;
          id: string;
          is_published: boolean;
          question: string;
          sort_order: number;
          updated_at: string;
          view_count: number;
        };
        Insert: {
          answer: string;
          category_id: string;
          created_at?: string;
          id?: string;
          is_published?: boolean;
          question: string;
          sort_order?: number;
          updated_at?: string;
          view_count?: number;
        };
        Update: {
          answer?: string;
          category_id?: string;
          created_at?: string;
          id?: string;
          is_published?: boolean;
          question?: string;
          sort_order?: number;
          updated_at?: string;
          view_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "agent_faqs_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "agent_faq_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_invoice_lines: {
        Row: {
          amount: number;
          created_at: string;
          description: string;
          id: string;
          invoice_id: string;
          quantity: number;
          referral_id: string | null;
          unit_price: number;
        };
        Insert: {
          amount?: number;
          created_at?: string;
          description: string;
          id?: string;
          invoice_id: string;
          quantity?: number;
          referral_id?: string | null;
          unit_price?: number;
        };
        Update: {
          amount?: number;
          created_at?: string;
          description?: string;
          id?: string;
          invoice_id?: string;
          quantity?: number;
          referral_id?: string | null;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "agent_invoice_lines_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "agent_invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_invoice_lines_referral_id_fkey";
            columns: ["referral_id"];
            isOneToOne: false;
            referencedRelation: "agent_referrals";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_invoices: {
        Row: {
          agent_id: string;
          created_at: string;
          id: string;
          invoice_number: string;
          issued_at: string | null;
          notes: string | null;
          paid_at: string | null;
          period_end: string;
          period_start: string;
          status: string;
          subtotal: number;
          tax_amount: number;
          tax_rate: number;
          total: number;
          updated_at: string;
        };
        Insert: {
          agent_id: string;
          created_at?: string;
          id?: string;
          invoice_number?: string;
          issued_at?: string | null;
          notes?: string | null;
          paid_at?: string | null;
          period_end: string;
          period_start: string;
          status?: string;
          subtotal?: number;
          tax_amount?: number;
          tax_rate?: number;
          total?: number;
          updated_at?: string;
        };
        Update: {
          agent_id?: string;
          created_at?: string;
          id?: string;
          invoice_number?: string;
          issued_at?: string | null;
          notes?: string | null;
          paid_at?: string | null;
          period_end?: string;
          period_start?: string;
          status?: string;
          subtotal?: number;
          tax_amount?: number;
          tax_rate?: number;
          total?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_invoices_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_material_categories: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      agent_material_downloads: {
        Row: {
          agent_id: string;
          downloaded_at: string;
          id: string;
          material_id: string;
          user_id: string;
        };
        Insert: {
          agent_id: string;
          downloaded_at?: string;
          id?: string;
          material_id: string;
          user_id: string;
        };
        Update: {
          agent_id?: string;
          downloaded_at?: string;
          id?: string;
          material_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_material_downloads_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_material_downloads_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "agent_materials";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_materials: {
        Row: {
          category_id: string;
          created_at: string;
          description: string | null;
          download_count: number;
          file_name: string;
          file_size: number;
          file_type: string;
          has_template: boolean;
          id: string;
          is_pinned: boolean;
          is_published: boolean;
          storage_path: string;
          template_fields: Json;
          title: string;
          updated_at: string;
          uploaded_by: string | null;
          version: string | null;
        };
        Insert: {
          category_id: string;
          created_at?: string;
          description?: string | null;
          download_count?: number;
          file_name: string;
          file_size?: number;
          file_type?: string;
          has_template?: boolean;
          id?: string;
          is_pinned?: boolean;
          is_published?: boolean;
          storage_path: string;
          template_fields?: Json;
          title: string;
          updated_at?: string;
          uploaded_by?: string | null;
          version?: string | null;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          description?: string | null;
          download_count?: number;
          file_name?: string;
          file_size?: number;
          file_type?: string;
          has_template?: boolean;
          id?: string;
          is_pinned?: boolean;
          is_published?: boolean;
          storage_path?: string;
          template_fields?: Json;
          title?: string;
          updated_at?: string;
          uploaded_by?: string | null;
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agent_materials_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "agent_material_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_notifications: {
        Row: {
          agent_id: string;
          body: string | null;
          created_at: string;
          id: string;
          is_read: boolean;
          link: string | null;
          title: string;
          type: string;
          user_id: string | null;
        };
        Insert: {
          agent_id: string;
          body?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          link?: string | null;
          title: string;
          type?: string;
          user_id?: string | null;
        };
        Update: {
          agent_id?: string;
          body?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          link?: string | null;
          title?: string;
          type?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "agent_notifications_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_referral_links: {
        Row: {
          agent_id: string;
          click_count: number;
          code: string;
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          label: string | null;
          updated_at: string | null;
          url: string;
        };
        Insert: {
          agent_id: string;
          click_count?: number;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          label?: string | null;
          updated_at?: string | null;
          url: string;
        };
        Update: {
          agent_id?: string;
          click_count?: number;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          label?: string | null;
          updated_at?: string | null;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_referral_links_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_referrals: {
        Row: {
          agent_id: string;
          commission_fixed: number | null;
          commission_rate: number | null;
          commission_type: string | null;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          contracted_at: string | null;
          created_at: string;
          id: string;
          notes: string | null;
          referral_code: string;
          shop_name: string;
          status: string;
          tenant_id: string | null;
          updated_at: string;
        };
        Insert: {
          agent_id: string;
          commission_fixed?: number | null;
          commission_rate?: number | null;
          commission_type?: string | null;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          contracted_at?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          referral_code?: string;
          shop_name: string;
          status?: string;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          agent_id?: string;
          commission_fixed?: number | null;
          commission_rate?: number | null;
          commission_type?: string | null;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          contracted_at?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          referral_code?: string;
          shop_name?: string;
          status?: string;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_referrals_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_referrals_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_shared_files: {
        Row: {
          agent_id: string;
          created_at: string;
          direction: string;
          file_name: string;
          file_size: number;
          file_type: string;
          id: string;
          note: string | null;
          storage_path: string;
          uploaded_by: string;
        };
        Insert: {
          agent_id: string;
          created_at?: string;
          direction: string;
          file_name: string;
          file_size: number;
          file_type: string;
          id?: string;
          note?: string | null;
          storage_path: string;
          uploaded_by: string;
        };
        Update: {
          agent_id?: string;
          created_at?: string;
          direction?: string;
          file_name?: string;
          file_size?: number;
          file_type?: string;
          id?: string;
          note?: string | null;
          storage_path?: string;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_shared_files_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_signing_requests: {
        Row: {
          agent_id: string;
          cloudsign_document_id: string | null;
          created_at: string;
          id: string;
          key_version: string | null;
          ledra_session_id: string | null;
          ledra_verified: boolean;
          notified_at: string | null;
          notified_channel: string | null;
          public_key_fingerprint: string | null;
          rejection_reason: string | null;
          requested_by: string | null;
          sent_at: string | null;
          sign_engine: string;
          sign_expires_at: string | null;
          sign_token: string | null;
          sign_url: string | null;
          signature: string | null;
          signed_at: string | null;
          signed_pdf_path: string | null;
          signer_email: string;
          signer_ip: string | null;
          signer_name: string;
          signer_user_agent: string | null;
          signing_payload: string | null;
          status: string;
          template_type: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          agent_id: string;
          cloudsign_document_id?: string | null;
          created_at?: string;
          id?: string;
          key_version?: string | null;
          ledra_session_id?: string | null;
          ledra_verified?: boolean;
          notified_at?: string | null;
          notified_channel?: string | null;
          public_key_fingerprint?: string | null;
          rejection_reason?: string | null;
          requested_by?: string | null;
          sent_at?: string | null;
          sign_engine?: string;
          sign_expires_at?: string | null;
          sign_token?: string | null;
          sign_url?: string | null;
          signature?: string | null;
          signed_at?: string | null;
          signed_pdf_path?: string | null;
          signer_email: string;
          signer_ip?: string | null;
          signer_name: string;
          signer_user_agent?: string | null;
          signing_payload?: string | null;
          status?: string;
          template_type: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          agent_id?: string;
          cloudsign_document_id?: string | null;
          created_at?: string;
          id?: string;
          key_version?: string | null;
          ledra_session_id?: string | null;
          ledra_verified?: boolean;
          notified_at?: string | null;
          notified_channel?: string | null;
          public_key_fingerprint?: string | null;
          rejection_reason?: string | null;
          requested_by?: string | null;
          sent_at?: string | null;
          sign_engine?: string;
          sign_expires_at?: string | null;
          sign_token?: string | null;
          sign_url?: string | null;
          signature?: string | null;
          signed_at?: string | null;
          signed_pdf_path?: string | null;
          signer_email?: string;
          signer_ip?: string | null;
          signer_name?: string;
          signer_user_agent?: string | null;
          signing_payload?: string | null;
          status?: string;
          template_type?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_signing_requests_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_signing_requests_ledra_session_id_fkey";
            columns: ["ledra_session_id"];
            isOneToOne: false;
            referencedRelation: "signature_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_support_tickets: {
        Row: {
          agent_id: string;
          category: string;
          created_at: string;
          id: string;
          priority: string;
          status: string;
          subject: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          agent_id: string;
          category?: string;
          created_at?: string;
          id?: string;
          priority?: string;
          status?: string;
          subject: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          agent_id?: string;
          category?: string;
          created_at?: string;
          id?: string;
          priority?: string;
          status?: string;
          subject?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_support_tickets_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_ticket_messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          is_admin: boolean;
          sender_id: string;
          ticket_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          is_admin?: boolean;
          sender_id: string;
          ticket_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          is_admin?: boolean;
          sender_id?: string;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_ticket_messages_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "agent_support_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_training_courses: {
        Row: {
          category: string;
          content_type: string;
          content_url: string | null;
          created_at: string;
          description: string | null;
          duration_min: number | null;
          id: string;
          is_published: boolean;
          is_required: boolean;
          sort_order: number;
          thumbnail_url: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          category?: string;
          content_type?: string;
          content_url?: string | null;
          created_at?: string;
          description?: string | null;
          duration_min?: number | null;
          id?: string;
          is_published?: boolean;
          is_required?: boolean;
          sort_order?: number;
          thumbnail_url?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          content_type?: string;
          content_url?: string | null;
          created_at?: string;
          description?: string | null;
          duration_min?: number | null;
          id?: string;
          is_published?: boolean;
          is_required?: boolean;
          sort_order?: number;
          thumbnail_url?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_training_progress: {
        Row: {
          agent_id: string;
          completed_at: string | null;
          course_id: string;
          created_at: string;
          id: string;
          progress: number;
          started_at: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          agent_id: string;
          completed_at?: string | null;
          course_id: string;
          created_at?: string;
          id?: string;
          progress?: number;
          started_at?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          agent_id?: string;
          completed_at?: string | null;
          course_id?: string;
          created_at?: string;
          id?: string;
          progress?: number;
          started_at?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_training_progress_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_training_progress_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "agent_training_courses";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_users: {
        Row: {
          agent_id: string;
          created_at: string;
          display_name: string | null;
          id: string;
          is_active: boolean;
          role: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          agent_id: string;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          is_active?: boolean;
          role?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          agent_id?: string;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          is_active?: boolean;
          role?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_users_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      agents: {
        Row: {
          address: string | null;
          bank_info: Json | null;
          commission_type: string;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          created_at: string;
          default_commission_fixed: number;
          default_commission_rate: number;
          email_notifications: boolean;
          id: string;
          line_official_id: string | null;
          logo_asset_path: string | null;
          name: string;
          notes: string | null;
          postal_code: string | null;
          slug: string | null;
          status: string;
          stripe_account_id: string | null;
          stripe_onboarding_done: boolean;
          updated_at: string;
          website_url: string | null;
        };
        Insert: {
          address?: string | null;
          bank_info?: Json | null;
          commission_type?: string;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          default_commission_fixed?: number;
          default_commission_rate?: number;
          email_notifications?: boolean;
          id?: string;
          line_official_id?: string | null;
          logo_asset_path?: string | null;
          name: string;
          notes?: string | null;
          postal_code?: string | null;
          slug?: string | null;
          status?: string;
          stripe_account_id?: string | null;
          stripe_onboarding_done?: boolean;
          updated_at?: string;
          website_url?: string | null;
        };
        Update: {
          address?: string | null;
          bank_info?: Json | null;
          commission_type?: string;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          default_commission_fixed?: number;
          default_commission_rate?: number;
          email_notifications?: boolean;
          id?: string;
          line_official_id?: string | null;
          logo_asset_path?: string | null;
          name?: string;
          notes?: string | null;
          postal_code?: string | null;
          slug?: string | null;
          status?: string;
          stripe_account_id?: string | null;
          stripe_onboarding_done?: boolean;
          updated_at?: string;
          website_url?: string | null;
        };
        Relationships: [];
      };
      ai_translation_cache: {
        Row: {
          cache_key: string;
          confidence: number | null;
          created_at: string;
          hit_count: number;
          last_accessed_at: string;
          model: string | null;
          source_text: string;
          target_lang: string;
          tone: string;
          translated_text: string;
        };
        Insert: {
          cache_key: string;
          confidence?: number | null;
          created_at?: string;
          hit_count?: number;
          last_accessed_at?: string;
          model?: string | null;
          source_text: string;
          target_lang: string;
          tone?: string;
          translated_text: string;
        };
        Update: {
          cache_key?: string;
          confidence?: number | null;
          created_at?: string;
          hit_count?: number;
          last_accessed_at?: string;
          model?: string | null;
          source_text?: string;
          target_lang?: string;
          tone?: string;
          translated_text?: string;
        };
        Relationships: [];
      };
      ai_usage_logs: {
        Row: {
          confidence: number | null;
          cost_jpy: number | null;
          created_at: string;
          endpoint: string;
          id: string;
          input_tokens: number | null;
          insurer_id: string | null;
          latency_ms: number | null;
          meta: Json | null;
          model: string | null;
          outcome: string;
          output_tokens: number | null;
          tenant_id: string | null;
          user_id: string | null;
        };
        Insert: {
          confidence?: number | null;
          cost_jpy?: number | null;
          created_at?: string;
          endpoint: string;
          id?: string;
          input_tokens?: number | null;
          insurer_id?: string | null;
          latency_ms?: number | null;
          meta?: Json | null;
          model?: string | null;
          outcome: string;
          output_tokens?: number | null;
          tenant_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          confidence?: number | null;
          cost_jpy?: number | null;
          created_at?: string;
          endpoint?: string;
          id?: string;
          input_tokens?: number | null;
          insurer_id?: string | null;
          latency_ms?: number | null;
          meta?: Json | null;
          model?: string | null;
          outcome?: string;
          output_tokens?: number | null;
          tenant_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_insurer_id_fkey";
            columns: ["insurer_id"];
            isOneToOne: false;
            referencedRelation: "insurers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_usage_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      announcement_reads: {
        Row: {
          announcement_id: string;
          id: string;
          read_at: string | null;
          user_id: string;
        };
        Insert: {
          announcement_id: string;
          id?: string;
          read_at?: string | null;
          user_id: string;
        };
        Update: {
          announcement_id?: string;
          id?: string;
          read_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey";
            columns: ["announcement_id"];
            isOneToOne: false;
            referencedRelation: "announcements";
            referencedColumns: ["id"];
          },
        ];
      };
      announcements: {
        Row: {
          body: string;
          category: string;
          created_at: string | null;
          expires_at: string | null;
          id: string;
          published: boolean;
          published_at: string | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          body: string;
          category?: string;
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          published?: boolean;
          published_at?: string | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          body?: string;
          category?: string;
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          published?: boolean;
          published_at?: string | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_type: string;
          actor_user_id: string | null;
          created_at: string;
          id: string;
          insurer_id: string | null;
          ip: string | null;
          performed_at: string;
          query_json: Json | null;
          target_public_id: string | null;
          tenant_id: string | null;
          user_agent: string | null;
        };
        Insert: {
          action: string;
          actor_type: string;
          actor_user_id?: string | null;
          created_at?: string;
          id?: string;
          insurer_id?: string | null;
          ip?: string | null;
          performed_at?: string;
          query_json?: Json | null;
          target_public_id?: string | null;
          tenant_id?: string | null;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_type?: string;
          actor_user_id?: string | null;
          created_at?: string;
          id?: string;
          insurer_id?: string | null;
          ip?: string | null;
          performed_at?: string;
          query_json?: Json | null;
          target_public_id?: string | null;
          tenant_id?: string | null;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      batch_pdf_jobs: {
        Row: {
          created_at: string;
          error_message: string | null;
          id: string;
          processed_count: number;
          public_ids: string[];
          result_urls: Json;
          status: string;
          tenant_id: string;
          total_count: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          error_message?: string | null;
          id?: string;
          processed_count?: number;
          public_ids?: string[];
          result_urls?: Json;
          status?: string;
          tenant_id: string;
          total_count?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          error_message?: string | null;
          id?: string;
          processed_count?: number;
          public_ids?: string[];
          result_urls?: Json;
          status?: string;
          tenant_id?: string;
          total_count?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "batch_pdf_jobs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_splits: {
        Row: {
          claim_number: string | null;
          created_at: string;
          document_id: string;
          id: string;
          notes: string | null;
          payer_name: string | null;
          split_amount: number;
          split_ratio: number | null;
          split_type: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          claim_number?: string | null;
          created_at?: string;
          document_id: string;
          id?: string;
          notes?: string | null;
          payer_name?: string | null;
          split_amount: number;
          split_ratio?: number | null;
          split_type: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          claim_number?: string | null;
          created_at?: string;
          document_id?: string;
          id?: string;
          notes?: string | null;
          payer_name?: string | null;
          split_amount?: number;
          split_ratio?: number | null;
          split_type?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_splits_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_splits_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_splits_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      body_repair_consents: {
        Row: {
          body_repair_job_id: string;
          created_at: string;
          created_by: string | null;
          explanation_json: Json;
          id: string;
          kind: string;
          signature_session_id: string | null;
          signed_at: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          body_repair_job_id: string;
          created_at?: string;
          created_by?: string | null;
          explanation_json?: Json;
          id?: string;
          kind: string;
          signature_session_id?: string | null;
          signed_at?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          body_repair_job_id?: string;
          created_at?: string;
          created_by?: string | null;
          explanation_json?: Json;
          id?: string;
          kind?: string;
          signature_session_id?: string | null;
          signed_at?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "body_repair_consents_body_repair_job_id_fkey";
            columns: ["body_repair_job_id"];
            isOneToOne: false;
            referencedRelation: "body_repair_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "body_repair_consents_signature_session_id_fkey";
            columns: ["signature_session_id"];
            isOneToOne: false;
            referencedRelation: "signature_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "body_repair_consents_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      body_repair_jobs: {
        Row: {
          actual_amount: number | null;
          actual_work_json: Json;
          assigned_staff_id: string | null;
          bodywork_start_at: string | null;
          certificate_id: string | null;
          claim_approved_amount: number | null;
          claim_decided_at: string | null;
          claim_number: string | null;
          claim_status: string | null;
          complete_at: string | null;
          created_at: string;
          customer_id: string | null;
          delivered_at: string | null;
          deviation_reason: string | null;
          due_date: string | null;
          estimate_amount: number | null;
          estimate_at: string | null;
          estimate_document_id: string | null;
          id: string;
          insurance_company: string | null;
          insurer_case_id: string | null;
          intake_at: string | null;
          invoice_document_id: string | null;
          is_specified_maintenance: boolean;
          notes: string | null;
          paint_start_at: string | null;
          planned_work_json: Json;
          record_retention_until: string | null;
          recorded_by: string | null;
          reservation_id: string | null;
          stage: string;
          tenant_id: string;
          track_token: string | null;
          updated_at: string;
          vehicle_id: string | null;
        };
        Insert: {
          actual_amount?: number | null;
          actual_work_json?: Json;
          assigned_staff_id?: string | null;
          bodywork_start_at?: string | null;
          certificate_id?: string | null;
          claim_approved_amount?: number | null;
          claim_decided_at?: string | null;
          claim_number?: string | null;
          claim_status?: string | null;
          complete_at?: string | null;
          created_at?: string;
          customer_id?: string | null;
          delivered_at?: string | null;
          deviation_reason?: string | null;
          due_date?: string | null;
          estimate_amount?: number | null;
          estimate_at?: string | null;
          estimate_document_id?: string | null;
          id?: string;
          insurance_company?: string | null;
          insurer_case_id?: string | null;
          intake_at?: string | null;
          invoice_document_id?: string | null;
          is_specified_maintenance?: boolean;
          notes?: string | null;
          paint_start_at?: string | null;
          planned_work_json?: Json;
          record_retention_until?: string | null;
          recorded_by?: string | null;
          reservation_id?: string | null;
          stage?: string;
          tenant_id: string;
          track_token?: string | null;
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Update: {
          actual_amount?: number | null;
          actual_work_json?: Json;
          assigned_staff_id?: string | null;
          bodywork_start_at?: string | null;
          certificate_id?: string | null;
          claim_approved_amount?: number | null;
          claim_decided_at?: string | null;
          claim_number?: string | null;
          claim_status?: string | null;
          complete_at?: string | null;
          created_at?: string;
          customer_id?: string | null;
          delivered_at?: string | null;
          deviation_reason?: string | null;
          due_date?: string | null;
          estimate_amount?: number | null;
          estimate_at?: string | null;
          estimate_document_id?: string | null;
          id?: string;
          insurance_company?: string | null;
          insurer_case_id?: string | null;
          intake_at?: string | null;
          invoice_document_id?: string | null;
          is_specified_maintenance?: boolean;
          notes?: string | null;
          paint_start_at?: string | null;
          planned_work_json?: Json;
          record_retention_until?: string | null;
          recorded_by?: string | null;
          reservation_id?: string | null;
          stage?: string;
          tenant_id?: string;
          track_token?: string | null;
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "body_repair_jobs_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "body_repair_jobs_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "body_repair_jobs_estimate_document_id_fkey";
            columns: ["estimate_document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "body_repair_jobs_estimate_document_id_fkey";
            columns: ["estimate_document_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "body_repair_jobs_insurer_case_id_fkey";
            columns: ["insurer_case_id"];
            isOneToOne: false;
            referencedRelation: "insurer_cases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "body_repair_jobs_invoice_document_id_fkey";
            columns: ["invoice_document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "body_repair_jobs_invoice_document_id_fkey";
            columns: ["invoice_document_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "body_repair_jobs_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "body_repair_jobs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "body_repair_jobs_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      booths: {
        Row: {
          booth_type: string | null;
          capacity: number;
          color: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          note: string | null;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          booth_type?: string | null;
          capacity?: number;
          color?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          note?: string | null;
          sort_order?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          booth_type?: string | null;
          capacity?: number;
          color?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          note?: string | null;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booths_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      brands: {
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          name: string;
          tenant_id: string | null;
          updated_at: string | null;
          website_url: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          tenant_id?: string | null;
          updated_at?: string | null;
          website_url?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          tenant_id?: string | null;
          updated_at?: string | null;
          website_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "brands_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      cert_idempotency_keys: {
        Row: {
          certificate_id: string;
          created_at: string;
          expires_at: string;
          idempotency_key: string;
          public_id: string;
          tenant_id: string;
        };
        Insert: {
          certificate_id: string;
          created_at?: string;
          expires_at?: string;
          idempotency_key: string;
          public_id: string;
          tenant_id: string;
        };
        Update: {
          certificate_id?: string;
          created_at?: string;
          expires_at?: string;
          idempotency_key?: string;
          public_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cert_idempotency_keys_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cert_idempotency_keys_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      certificate_anchor_batches: {
        Row: {
          anchored_at: string;
          block_number: number | null;
          contract_address: string;
          created_at: string;
          id: string;
          leaf_count: number;
          merkle_root: string;
          network: string;
          tx_hash: string;
        };
        Insert: {
          anchored_at: string;
          block_number?: number | null;
          contract_address: string;
          created_at?: string;
          id?: string;
          leaf_count: number;
          merkle_root: string;
          network: string;
          tx_hash: string;
        };
        Update: {
          anchored_at?: string;
          block_number?: number | null;
          contract_address?: string;
          created_at?: string;
          id?: string;
          leaf_count?: number;
          merkle_root?: string;
          network?: string;
          tx_hash?: string;
        };
        Relationships: [];
      };
      certificate_anchors: {
        Row: {
          anchor_route: string;
          anchored_at: string | null;
          batch_id: string | null;
          block_number: number | null;
          canonical_json: Json;
          cert_digest: string;
          certificate_id: string;
          created_at: string;
          failure_reason: string | null;
          id: string;
          instant_tx_hash: string | null;
          merkle_proof: Json | null;
          polygon_network: string | null;
          retry_count: number;
          schema_version: string;
          status: string;
          tenant_id: string;
        };
        Insert: {
          anchor_route?: string;
          anchored_at?: string | null;
          batch_id?: string | null;
          block_number?: number | null;
          canonical_json: Json;
          cert_digest: string;
          certificate_id: string;
          created_at?: string;
          failure_reason?: string | null;
          id?: string;
          instant_tx_hash?: string | null;
          merkle_proof?: Json | null;
          polygon_network?: string | null;
          retry_count?: number;
          schema_version?: string;
          status?: string;
          tenant_id: string;
        };
        Update: {
          anchor_route?: string;
          anchored_at?: string | null;
          batch_id?: string | null;
          block_number?: number | null;
          canonical_json?: Json;
          cert_digest?: string;
          certificate_id?: string;
          created_at?: string;
          failure_reason?: string | null;
          id?: string;
          instant_tx_hash?: string | null;
          merkle_proof?: Json | null;
          polygon_network?: string | null;
          retry_count?: number;
          schema_version?: string;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "certificate_anchors_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "certificate_anchor_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificate_anchors_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificate_anchors_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      certificate_edit_histories: {
        Row: {
          certificate_id: string;
          changes: Json;
          created_at: string;
          edited_by: string | null;
          id: string;
          tenant_id: string;
          version: number;
        };
        Insert: {
          certificate_id: string;
          changes?: Json;
          created_at?: string;
          edited_by?: string | null;
          id?: string;
          tenant_id: string;
          version?: number;
        };
        Update: {
          certificate_id?: string;
          changes?: Json;
          created_at?: string;
          edited_by?: string | null;
          id?: string;
          tenant_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "certificate_edit_histories_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificate_edit_histories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      certificate_images: {
        Row: {
          annotated_at: string | null;
          annotated_by: string | null;
          annotations: Json | null;
          authenticity_grade: string;
          c2pa_manifest: Json | null;
          c2pa_manifest_cid: string | null;
          c2pa_verified: boolean;
          capture_binding_reason: string | null;
          capture_nonce: string | null;
          certificate_id: string;
          content_type: string;
          created_at: string;
          created_by: string | null;
          deepfake_score: number | null;
          deepfake_verdict: string | null;
          device_attestation_provider: string | null;
          device_attestation_token_hash: string | null;
          device_attestation_verified: boolean;
          exif_captured_at: string | null;
          exif_device_model: string | null;
          exif_gps_stripped: boolean;
          external_c2pa_present: boolean | null;
          external_c2pa_signer: string | null;
          external_c2pa_verified: boolean | null;
          file_name: string;
          file_size: number;
          gps_check_verdict: string | null;
          gps_distance_bucket: string | null;
          id: string;
          medium_path: string | null;
          original_sha256: string | null;
          perceptual_hash: string | null;
          polygon_network: string | null;
          polygon_tx_hash: string | null;
          rendered_at: string | null;
          rendered_storage_path: string | null;
          sha256: string | null;
          sort_order: number;
          stage: string;
          storage_path: string;
          tenant_id: string;
          thumbnail_path: string | null;
          tsa_authority: string | null;
          tsa_timestamp_at: string | null;
          tsa_token: string | null;
        };
        Insert: {
          annotated_at?: string | null;
          annotated_by?: string | null;
          annotations?: Json | null;
          authenticity_grade?: string;
          c2pa_manifest?: Json | null;
          c2pa_manifest_cid?: string | null;
          c2pa_verified?: boolean;
          capture_binding_reason?: string | null;
          capture_nonce?: string | null;
          certificate_id: string;
          content_type: string;
          created_at?: string;
          created_by?: string | null;
          deepfake_score?: number | null;
          deepfake_verdict?: string | null;
          device_attestation_provider?: string | null;
          device_attestation_token_hash?: string | null;
          device_attestation_verified?: boolean;
          exif_captured_at?: string | null;
          exif_device_model?: string | null;
          exif_gps_stripped?: boolean;
          external_c2pa_present?: boolean | null;
          external_c2pa_signer?: string | null;
          external_c2pa_verified?: boolean | null;
          file_name: string;
          file_size: number;
          gps_check_verdict?: string | null;
          gps_distance_bucket?: string | null;
          id?: string;
          medium_path?: string | null;
          original_sha256?: string | null;
          perceptual_hash?: string | null;
          polygon_network?: string | null;
          polygon_tx_hash?: string | null;
          rendered_at?: string | null;
          rendered_storage_path?: string | null;
          sha256?: string | null;
          sort_order?: number;
          stage?: string;
          storage_path: string;
          tenant_id: string;
          thumbnail_path?: string | null;
          tsa_authority?: string | null;
          tsa_timestamp_at?: string | null;
          tsa_token?: string | null;
        };
        Update: {
          annotated_at?: string | null;
          annotated_by?: string | null;
          annotations?: Json | null;
          authenticity_grade?: string;
          c2pa_manifest?: Json | null;
          c2pa_manifest_cid?: string | null;
          c2pa_verified?: boolean;
          capture_binding_reason?: string | null;
          capture_nonce?: string | null;
          certificate_id?: string;
          content_type?: string;
          created_at?: string;
          created_by?: string | null;
          deepfake_score?: number | null;
          deepfake_verdict?: string | null;
          device_attestation_provider?: string | null;
          device_attestation_token_hash?: string | null;
          device_attestation_verified?: boolean;
          exif_captured_at?: string | null;
          exif_device_model?: string | null;
          exif_gps_stripped?: boolean;
          external_c2pa_present?: boolean | null;
          external_c2pa_signer?: string | null;
          external_c2pa_verified?: boolean | null;
          file_name?: string;
          file_size?: number;
          gps_check_verdict?: string | null;
          gps_distance_bucket?: string | null;
          id?: string;
          medium_path?: string | null;
          original_sha256?: string | null;
          perceptual_hash?: string | null;
          polygon_network?: string | null;
          polygon_tx_hash?: string | null;
          rendered_at?: string | null;
          rendered_storage_path?: string | null;
          sha256?: string | null;
          sort_order?: number;
          stage?: string;
          storage_path?: string;
          tenant_id?: string;
          thumbnail_path?: string | null;
          tsa_authority?: string | null;
          tsa_timestamp_at?: string | null;
          tsa_token?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "certificate_images_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificate_images_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_certimg_tenant";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      certificate_maintenance_logs: {
        Row: {
          certificate_id: string;
          content: string;
          created_at: string;
          id: string;
          performed_at: string;
          performed_by: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          certificate_id: string;
          content: string;
          created_at?: string;
          id?: string;
          performed_at: string;
          performed_by?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          certificate_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
          performed_at?: string;
          performed_by?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "certificate_maintenance_logs_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificate_maintenance_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      certificate_media: {
        Row: {
          before_path: string | null;
          caption: string | null;
          certificate_id: string;
          content_type: string | null;
          created_at: string;
          diff_summary: string | null;
          diff_summary_generated_at: string | null;
          diff_summary_model: string | null;
          duration_ms: number | null;
          file_size: number | null;
          height: number | null;
          id: string;
          media_type: string;
          poster_path: string | null;
          sort_order: number;
          storage_path: string;
          tenant_id: string;
          width: number | null;
        };
        Insert: {
          before_path?: string | null;
          caption?: string | null;
          certificate_id: string;
          content_type?: string | null;
          created_at?: string;
          diff_summary?: string | null;
          diff_summary_generated_at?: string | null;
          diff_summary_model?: string | null;
          duration_ms?: number | null;
          file_size?: number | null;
          height?: number | null;
          id?: string;
          media_type: string;
          poster_path?: string | null;
          sort_order?: number;
          storage_path: string;
          tenant_id: string;
          width?: number | null;
        };
        Update: {
          before_path?: string | null;
          caption?: string | null;
          certificate_id?: string;
          content_type?: string | null;
          created_at?: string;
          diff_summary?: string | null;
          diff_summary_generated_at?: string | null;
          diff_summary_model?: string | null;
          duration_ms?: number | null;
          file_size?: number | null;
          height?: number | null;
          id?: string;
          media_type?: string;
          poster_path?: string | null;
          sort_order?: number;
          storage_path?: string;
          tenant_id?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "certificate_media_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificate_media_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      certificate_quality_scores: {
        Row: {
          ai_checked_at: string | null;
          certificate_id: string;
          created_at: string;
          id: string;
          missing_fields: Json;
          missing_photos: Json;
          overall_status: string;
          photo_results: Json;
          score: number;
          standard_level: string | null;
          tenant_id: string;
          updated_at: string;
          warning_messages: Json;
        };
        Insert: {
          ai_checked_at?: string | null;
          certificate_id: string;
          created_at?: string;
          id?: string;
          missing_fields?: Json;
          missing_photos?: Json;
          overall_status?: string;
          photo_results?: Json;
          score?: number;
          standard_level?: string | null;
          tenant_id: string;
          updated_at?: string;
          warning_messages?: Json;
        };
        Update: {
          ai_checked_at?: string | null;
          certificate_id?: string;
          created_at?: string;
          id?: string;
          missing_fields?: Json;
          missing_photos?: Json;
          overall_status?: string;
          photo_results?: Json;
          score?: number;
          standard_level?: string | null;
          tenant_id?: string;
          updated_at?: string;
          warning_messages?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "certificate_quality_scores_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: true;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
        ];
      };
      certificate_versions: {
        Row: {
          certificate_id: string;
          change_reason: string | null;
          content: Json;
          content_hash: string;
          created_at: string;
          created_by: string | null;
          hash_alg: string;
          id: string;
          server_received_at: string;
          tenant_id: string;
          version: number;
        };
        Insert: {
          certificate_id: string;
          change_reason?: string | null;
          content: Json;
          content_hash: string;
          created_at?: string;
          created_by?: string | null;
          hash_alg?: string;
          id?: string;
          server_received_at?: string;
          tenant_id: string;
          version: number;
        };
        Update: {
          certificate_id?: string;
          change_reason?: string | null;
          content?: Json;
          content_hash?: string;
          created_at?: string;
          created_by?: string | null;
          hash_alg?: string;
          id?: string;
          server_received_at?: string;
          tenant_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "certificate_versions_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificate_versions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      certificates: {
        Row: {
          accessory_json: Json | null;
          body_repair_json: Json | null;
          coating_products_json: Json | null;
          content_free_text: string | null;
          content_preset_json: Json;
          craftsman_name: string | null;
          craftsman_staff_id: string | null;
          created_at: string;
          created_by: string | null;
          current_version: number;
          current_version_id: string | null;
          customer_id: string | null;
          customer_name: string;
          customer_phone_last4: string | null;
          customer_phone_last4_hash: string | null;
          damage_map_json: Json | null;
          delivery_acknowledged_at: string | null;
          expiry_date: string | null;
          expiry_type: Database["public"]["Enums"]["expiry_type_enum"];
          expiry_value: string | null;
          footer_variant: string;
          id: string;
          is_hidden: boolean;
          latest_anchor_id: string | null;
          logo_asset_path: string | null;
          maintenance_date: string | null;
          maintenance_json: Json | null;
          manufacturer_id: string | null;
          manufacturer_template_id: string | null;
          meta: Json | null;
          parent_certificate_id: string | null;
          payment_id: string | null;
          ppf_coverage_json: Json | null;
          public_id: string;
          quality_fields_json: Json | null;
          remarks: string | null;
          reservation_id: string | null;
          service_price: number | null;
          service_type: string | null;
          signed_at: string | null;
          status: Database["public"]["Enums"]["certificate_status_enum"];
          store_id: string | null;
          template_id: string | null;
          tenant_id: string;
          updated_at: string;
          vehicle_id: string | null;
          vehicle_info_json: Json;
          warranty_exclusions: string | null;
          warranty_period_end: string | null;
        };
        Insert: {
          accessory_json?: Json | null;
          body_repair_json?: Json | null;
          coating_products_json?: Json | null;
          content_free_text?: string | null;
          content_preset_json?: Json;
          craftsman_name?: string | null;
          craftsman_staff_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_version?: number;
          current_version_id?: string | null;
          customer_id?: string | null;
          customer_name: string;
          customer_phone_last4?: string | null;
          customer_phone_last4_hash?: string | null;
          damage_map_json?: Json | null;
          delivery_acknowledged_at?: string | null;
          expiry_date?: string | null;
          expiry_type?: Database["public"]["Enums"]["expiry_type_enum"];
          expiry_value?: string | null;
          footer_variant?: string;
          id?: string;
          is_hidden?: boolean;
          latest_anchor_id?: string | null;
          logo_asset_path?: string | null;
          maintenance_date?: string | null;
          maintenance_json?: Json | null;
          manufacturer_id?: string | null;
          manufacturer_template_id?: string | null;
          meta?: Json | null;
          parent_certificate_id?: string | null;
          payment_id?: string | null;
          ppf_coverage_json?: Json | null;
          public_id?: string;
          quality_fields_json?: Json | null;
          remarks?: string | null;
          reservation_id?: string | null;
          service_price?: number | null;
          service_type?: string | null;
          signed_at?: string | null;
          status?: Database["public"]["Enums"]["certificate_status_enum"];
          store_id?: string | null;
          template_id?: string | null;
          tenant_id: string;
          updated_at?: string;
          vehicle_id?: string | null;
          vehicle_info_json?: Json;
          warranty_exclusions?: string | null;
          warranty_period_end?: string | null;
        };
        Update: {
          accessory_json?: Json | null;
          body_repair_json?: Json | null;
          coating_products_json?: Json | null;
          content_free_text?: string | null;
          content_preset_json?: Json;
          craftsman_name?: string | null;
          craftsman_staff_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_version?: number;
          current_version_id?: string | null;
          customer_id?: string | null;
          customer_name?: string;
          customer_phone_last4?: string | null;
          customer_phone_last4_hash?: string | null;
          damage_map_json?: Json | null;
          delivery_acknowledged_at?: string | null;
          expiry_date?: string | null;
          expiry_type?: Database["public"]["Enums"]["expiry_type_enum"];
          expiry_value?: string | null;
          footer_variant?: string;
          id?: string;
          is_hidden?: boolean;
          latest_anchor_id?: string | null;
          logo_asset_path?: string | null;
          maintenance_date?: string | null;
          maintenance_json?: Json | null;
          manufacturer_id?: string | null;
          manufacturer_template_id?: string | null;
          meta?: Json | null;
          parent_certificate_id?: string | null;
          payment_id?: string | null;
          ppf_coverage_json?: Json | null;
          public_id?: string;
          quality_fields_json?: Json | null;
          remarks?: string | null;
          reservation_id?: string | null;
          service_price?: number | null;
          service_type?: string | null;
          signed_at?: string | null;
          status?: Database["public"]["Enums"]["certificate_status_enum"];
          store_id?: string | null;
          template_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
          vehicle_id?: string | null;
          vehicle_info_json?: Json;
          warranty_exclusions?: string | null;
          warranty_period_end?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "certificates_craftsman_staff_id_fkey";
            columns: ["craftsman_staff_id"];
            isOneToOne: false;
            referencedRelation: "staff_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_current_version_id_fkey";
            columns: ["current_version_id"];
            isOneToOne: false;
            referencedRelation: "certificate_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_latest_anchor_id_fkey";
            columns: ["latest_anchor_id"];
            isOneToOne: false;
            referencedRelation: "certificate_anchors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_manufacturer_id_fkey";
            columns: ["manufacturer_id"];
            isOneToOne: false;
            referencedRelation: "manufacturers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_manufacturer_template_id_fkey";
            columns: ["manufacturer_template_id"];
            isOneToOne: false;
            referencedRelation: "manufacturer_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_parent_certificate_id_fkey";
            columns: ["parent_certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_certificates_payment";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_messages: {
        Row: {
          attachment_path: string | null;
          attachment_type: string | null;
          body: string;
          created_at: string;
          from_tenant_id: string;
          id: string;
          is_system: boolean;
          job_order_id: string;
          sender_tenant_id: string;
          sender_user_id: string;
          to_tenant_id: string;
        };
        Insert: {
          attachment_path?: string | null;
          attachment_type?: string | null;
          body: string;
          created_at?: string;
          from_tenant_id: string;
          id?: string;
          is_system?: boolean;
          job_order_id: string;
          sender_tenant_id: string;
          sender_user_id: string;
          to_tenant_id: string;
        };
        Update: {
          attachment_path?: string | null;
          attachment_type?: string | null;
          body?: string;
          created_at?: string;
          from_tenant_id?: string;
          id?: string;
          is_system?: boolean;
          job_order_id?: string;
          sender_tenant_id?: string;
          sender_user_id?: string;
          to_tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_job_order_id_fkey";
            columns: ["job_order_id"];
            isOneToOne: false;
            referencedRelation: "job_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_messages_sender_tenant_id_fkey";
            columns: ["sender_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      closed_days: {
        Row: {
          closed_date: string | null;
          created_at: string | null;
          day_of_week: number | null;
          id: string;
          note: string | null;
          tenant_id: string;
          type: string;
          updated_at: string | null;
        };
        Insert: {
          closed_date?: string | null;
          created_at?: string | null;
          day_of_week?: number | null;
          id?: string;
          note?: string | null;
          tenant_id: string;
          type?: string;
          updated_at?: string | null;
        };
        Update: {
          closed_date?: string | null;
          created_at?: string | null;
          day_of_week?: number | null;
          id?: string;
          note?: string | null;
          tenant_id?: string;
          type?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "closed_days_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      coating_products: {
        Row: {
          brand_id: string;
          created_at: string | null;
          description: string | null;
          id: string;
          name: string;
          product_code: string | null;
          tenant_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          brand_id: string;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          product_code?: string | null;
          tenant_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          brand_id?: string;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          product_code?: string | null;
          tenant_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "coating_products_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coating_products_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_schedules: {
        Row: {
          assigned_user_id: string | null;
          completed_at: string | null;
          contact_type: string;
          created_at: string;
          customer_id: string | null;
          id: string;
          notes: string | null;
          result: string | null;
          scheduled_at: string;
          status: string;
          tenant_id: string;
          updated_at: string;
          vehicle_id: string | null;
        };
        Insert: {
          assigned_user_id?: string | null;
          completed_at?: string | null;
          contact_type?: string;
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          notes?: string | null;
          result?: string | null;
          scheduled_at: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Update: {
          assigned_user_id?: string | null;
          completed_at?: string | null;
          contact_type?: string;
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          notes?: string | null;
          result?: string | null;
          scheduled_at?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contact_schedules_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_schedules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_schedules_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      coupon_issues: {
        Row: {
          coupon_id: string;
          customer_id: string | null;
          discount_applied: number | null;
          document_id: string | null;
          expires_at: string | null;
          id: string;
          issue_channel: string | null;
          issued_at: string;
          status: string;
          tenant_id: string;
          used_at: string | null;
        };
        Insert: {
          coupon_id: string;
          customer_id?: string | null;
          discount_applied?: number | null;
          document_id?: string | null;
          expires_at?: string | null;
          id?: string;
          issue_channel?: string | null;
          issued_at?: string;
          status?: string;
          tenant_id: string;
          used_at?: string | null;
        };
        Update: {
          coupon_id?: string;
          customer_id?: string | null;
          discount_applied?: number | null;
          document_id?: string | null;
          expires_at?: string | null;
          id?: string;
          issue_channel?: string | null;
          issued_at?: string;
          status?: string;
          tenant_id?: string;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "coupon_issues_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coupon_issues_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coupon_issues_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coupon_issues_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coupon_issues_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      coupons: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          discount_type: string;
          discount_value: number;
          id: string;
          is_active: boolean;
          max_uses: number | null;
          min_purchase: number | null;
          name: string;
          notes: string | null;
          tenant_id: string;
          updated_at: string;
          used_count: number;
          valid_from: string | null;
          valid_until: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          discount_type?: string;
          discount_value: number;
          id?: string;
          is_active?: boolean;
          max_uses?: number | null;
          min_purchase?: number | null;
          name: string;
          notes?: string | null;
          tenant_id: string;
          updated_at?: string;
          used_count?: number;
          valid_from?: string | null;
          valid_until?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          discount_type?: string;
          discount_value?: number;
          id?: string;
          is_active?: boolean;
          max_uses?: number | null;
          min_purchase?: number | null;
          name?: string;
          notes?: string | null;
          tenant_id?: string;
          updated_at?: string;
          used_count?: number;
          valid_from?: string | null;
          valid_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "coupons_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      cron_failure_streaks: {
        Row: {
          consecutive_failures: number;
          created_at: string;
          last_alert_at: string | null;
          last_error: string | null;
          last_failure_at: string | null;
          last_success_at: string | null;
          task: string;
          updated_at: string;
        };
        Insert: {
          consecutive_failures?: number;
          created_at?: string;
          last_alert_at?: string | null;
          last_error?: string | null;
          last_failure_at?: string | null;
          last_success_at?: string | null;
          task: string;
          updated_at?: string;
        };
        Update: {
          consecutive_failures?: number;
          created_at?: string;
          last_alert_at?: string | null;
          last_error?: string | null;
          last_failure_at?: string | null;
          last_success_at?: string | null;
          task?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cron_locks: {
        Row: {
          acquired_at: string;
          expires_at: string;
          task: string;
        };
        Insert: {
          acquired_at?: string;
          expires_at: string;
          task: string;
        };
        Update: {
          acquired_at?: string;
          expires_at?: string;
          task?: string;
        };
        Relationships: [];
      };
      customer_ai_summaries: {
        Row: {
          customer_id: string;
          generated_at: string;
          signals_hash: string;
          summary: string;
          tenant_id: string;
        };
        Insert: {
          customer_id: string;
          generated_at?: string;
          signals_hash: string;
          summary: string;
          tenant_id: string;
        };
        Update: {
          customer_id?: string;
          generated_at?: string;
          signals_hash?: string;
          summary?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_ai_summaries_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: true;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_ai_summaries_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_branches: {
        Row: {
          address: string | null;
          contact_email: string | null;
          contact_person: string | null;
          created_at: string;
          customer_id: string;
          id: string;
          name: string;
          name_kana: string | null;
          note: string | null;
          phone: string | null;
          postal_code: string | null;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          address?: string | null;
          contact_email?: string | null;
          contact_person?: string | null;
          created_at?: string;
          customer_id: string;
          id?: string;
          name: string;
          name_kana?: string | null;
          note?: string | null;
          phone?: string | null;
          postal_code?: string | null;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          address?: string | null;
          contact_email?: string | null;
          contact_person?: string | null;
          created_at?: string;
          customer_id?: string;
          id?: string;
          name?: string;
          name_kana?: string | null;
          note?: string | null;
          phone?: string | null;
          postal_code?: string | null;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customer_branches_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_branches_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_concerns: {
        Row: {
          admin_response: string | null;
          category: string | null;
          certificate_id: string | null;
          concern_text: string;
          created_at: string;
          customer_email: string | null;
          customer_name: string | null;
          id: string;
          job_id: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          source_token: string;
          source_type: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          admin_response?: string | null;
          category?: string | null;
          certificate_id?: string | null;
          concern_text: string;
          created_at?: string;
          customer_email?: string | null;
          customer_name?: string | null;
          id?: string;
          job_id?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          source_token: string;
          source_type: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          admin_response?: string | null;
          category?: string | null;
          certificate_id?: string | null;
          concern_text?: string;
          created_at?: string;
          customer_email?: string | null;
          customer_name?: string | null;
          id?: string;
          job_id?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          source_token?: string;
          source_type?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_concerns_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_concerns_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_concerns_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_deletion_requests: {
        Row: {
          cancelled_at: string | null;
          created_at: string;
          customer_id: string | null;
          email: string | null;
          error_message: string | null;
          executed_at: string | null;
          id: string;
          phone_last4_hash: string | null;
          reason: string | null;
          scheduled_for: string;
          source_ip: unknown;
          status: string;
          tenant_id: string;
        };
        Insert: {
          cancelled_at?: string | null;
          created_at?: string;
          customer_id?: string | null;
          email?: string | null;
          error_message?: string | null;
          executed_at?: string | null;
          id?: string;
          phone_last4_hash?: string | null;
          reason?: string | null;
          scheduled_for?: string;
          source_ip?: unknown;
          status?: string;
          tenant_id: string;
        };
        Update: {
          cancelled_at?: string | null;
          created_at?: string;
          customer_id?: string | null;
          email?: string | null;
          error_message?: string | null;
          executed_at?: string | null;
          id?: string;
          phone_last4_hash?: string | null;
          reason?: string | null;
          scheduled_for?: string;
          source_ip?: unknown;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_deletion_requests_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_deletion_requests_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_global_login_codes: {
        Row: {
          attempts: number;
          code_hash: string;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          phone_last4: string;
          used_at: string | null;
        };
        Insert: {
          attempts?: number;
          code_hash: string;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          phone_last4: string;
          used_at?: string | null;
        };
        Update: {
          attempts?: number;
          code_hash?: string;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          phone_last4?: string;
          used_at?: string | null;
        };
        Relationships: [];
      };
      customer_global_sessions: {
        Row: {
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          identity_hash: string;
          phone_last4: string;
          revoked_at: string | null;
          session_hash: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          identity_hash: string;
          phone_last4: string;
          revoked_at?: string | null;
          session_hash: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          identity_hash?: string;
          phone_last4?: string;
          revoked_at?: string | null;
          session_hash?: string;
        };
        Relationships: [];
      };
      customer_inquiries: {
        Row: {
          admin_reply: string | null;
          ai_category: string | null;
          ai_classified_at: string | null;
          ai_confidence: number | null;
          ai_draft_reply: string | null;
          ai_priority: string | null;
          created_at: string;
          customer_id: string | null;
          customer_name: string | null;
          id: string;
          message: string;
          phone_last4_hash: string | null;
          replied_at: string | null;
          replied_by: string | null;
          status: string;
          subject: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          admin_reply?: string | null;
          ai_category?: string | null;
          ai_classified_at?: string | null;
          ai_confidence?: number | null;
          ai_draft_reply?: string | null;
          ai_priority?: string | null;
          created_at?: string;
          customer_id?: string | null;
          customer_name?: string | null;
          id?: string;
          message: string;
          phone_last4_hash?: string | null;
          replied_at?: string | null;
          replied_by?: string | null;
          status?: string;
          subject?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          admin_reply?: string | null;
          ai_category?: string | null;
          ai_classified_at?: string | null;
          ai_confidence?: number | null;
          ai_draft_reply?: string | null;
          ai_priority?: string | null;
          created_at?: string;
          customer_id?: string | null;
          customer_name?: string | null;
          id?: string;
          message?: string;
          phone_last4_hash?: string | null;
          replied_at?: string | null;
          replied_by?: string | null;
          status?: string;
          subject?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_inquiries_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_inquiries_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_intake_invitations: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          completed_at: string | null;
          completed_customer_id: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          label: string | null;
          line_user_id: string | null;
          ocr_attempts: number;
          revoked_at: string | null;
          short_id: string;
          status: string;
          store_id: string | null;
          submitted_address: string | null;
          submitted_at: string | null;
          submitted_birth_date: string | null;
          submitted_email: string | null;
          submitted_name: string | null;
          submitted_name_kana: string | null;
          submitted_note: string | null;
          submitted_phone: string | null;
          submitted_postal_code: string | null;
          tenant_id: string;
          token_hash: string;
          validation_issues: Json | null;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          completed_at?: string | null;
          completed_customer_id?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by?: string | null;
          expires_at: string;
          id?: string;
          label?: string | null;
          line_user_id?: string | null;
          ocr_attempts?: number;
          revoked_at?: string | null;
          short_id: string;
          status?: string;
          store_id?: string | null;
          submitted_address?: string | null;
          submitted_at?: string | null;
          submitted_birth_date?: string | null;
          submitted_email?: string | null;
          submitted_name?: string | null;
          submitted_name_kana?: string | null;
          submitted_note?: string | null;
          submitted_phone?: string | null;
          submitted_postal_code?: string | null;
          tenant_id: string;
          token_hash: string;
          validation_issues?: Json | null;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          completed_at?: string | null;
          completed_customer_id?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          label?: string | null;
          line_user_id?: string | null;
          ocr_attempts?: number;
          revoked_at?: string | null;
          short_id?: string;
          status?: string;
          store_id?: string | null;
          submitted_address?: string | null;
          submitted_at?: string | null;
          submitted_birth_date?: string | null;
          submitted_email?: string | null;
          submitted_name?: string | null;
          submitted_name_kana?: string | null;
          submitted_note?: string | null;
          submitted_phone?: string | null;
          submitted_postal_code?: string | null;
          tenant_id?: string;
          token_hash?: string;
          validation_issues?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "customer_intake_invitations_completed_customer_id_fkey";
            columns: ["completed_customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_intake_invitations_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_intake_invitations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_intake_links: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          label: string | null;
          last_used_at: string | null;
          short_id: string;
          store_id: string | null;
          submission_count: number;
          tenant_id: string;
          token_cipher: string;
          token_hash: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          label?: string | null;
          last_used_at?: string | null;
          short_id: string;
          store_id?: string | null;
          submission_count?: number;
          tenant_id: string;
          token_cipher: string;
          token_hash: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          label?: string | null;
          last_used_at?: string | null;
          short_id?: string;
          store_id?: string | null;
          submission_count?: number;
          tenant_id?: string;
          token_cipher?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_intake_links_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_intake_links_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_line_link_codes: {
        Row: {
          code_hash: string;
          created_at: string;
          created_by: string | null;
          customer_id: string;
          expires_at: string;
          id: string;
          tenant_id: string;
          used_at: string | null;
          used_line_user_id: string | null;
        };
        Insert: {
          code_hash: string;
          created_at?: string;
          created_by?: string | null;
          customer_id: string;
          expires_at: string;
          id?: string;
          tenant_id: string;
          used_at?: string | null;
          used_line_user_id?: string | null;
        };
        Update: {
          code_hash?: string;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string;
          expires_at?: string;
          id?: string;
          tenant_id?: string;
          used_at?: string | null;
          used_line_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customer_line_link_codes_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_line_link_codes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_login_codes: {
        Row: {
          attempts: number;
          code_hash: string;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          phone_last4_hash: string;
          tenant_id: string;
          used_at: string | null;
        };
        Insert: {
          attempts?: number;
          code_hash: string;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          phone_last4_hash: string;
          tenant_id: string;
          used_at?: string | null;
        };
        Update: {
          attempts?: number;
          code_hash?: string;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          phone_last4_hash?: string;
          tenant_id?: string;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customer_login_codes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_messages: {
        Row: {
          ai_extracted: Json | null;
          attachment_content_type: string | null;
          attachment_path: string | null;
          body: string;
          channel: string;
          created_at: string;
          customer_id: string | null;
          delivered_at: string | null;
          direction: string;
          email_from: string | null;
          failed_at: string | null;
          failure_reason: string | null;
          id: string;
          line_message_id: string | null;
          line_timestamp_ms: number | null;
          line_user_id: string | null;
          raw_event: Json | null;
          read_at: string | null;
          sent_by: string | null;
          tenant_id: string;
        };
        Insert: {
          ai_extracted?: Json | null;
          attachment_content_type?: string | null;
          attachment_path?: string | null;
          body: string;
          channel?: string;
          created_at?: string;
          customer_id?: string | null;
          delivered_at?: string | null;
          direction: string;
          email_from?: string | null;
          failed_at?: string | null;
          failure_reason?: string | null;
          id?: string;
          line_message_id?: string | null;
          line_timestamp_ms?: number | null;
          line_user_id?: string | null;
          raw_event?: Json | null;
          read_at?: string | null;
          sent_by?: string | null;
          tenant_id: string;
        };
        Update: {
          ai_extracted?: Json | null;
          attachment_content_type?: string | null;
          attachment_path?: string | null;
          body?: string;
          channel?: string;
          created_at?: string;
          customer_id?: string | null;
          delivered_at?: string | null;
          direction?: string;
          email_from?: string | null;
          failed_at?: string | null;
          failure_reason?: string | null;
          id?: string;
          line_message_id?: string | null;
          line_timestamp_ms?: number | null;
          line_user_id?: string | null;
          raw_event?: Json | null;
          read_at?: string | null;
          sent_by?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_messages_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_messages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_portal_login_tokens: {
        Row: {
          created_at: string;
          customer_id: string;
          expires_at: string;
          id: string;
          tenant_id: string;
          token_hash: string;
          used_at: string | null;
        };
        Insert: {
          created_at?: string;
          customer_id: string;
          expires_at: string;
          id?: string;
          tenant_id: string;
          token_hash: string;
          used_at?: string | null;
        };
        Update: {
          created_at?: string;
          customer_id?: string;
          expires_at?: string;
          id?: string;
          tenant_id?: string;
          token_hash?: string;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customer_portal_login_tokens_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_portal_login_tokens_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_rank_rules: {
        Row: {
          badge_color: string | null;
          created_at: string;
          id: string;
          min_total_spend: number | null;
          min_visits: number | null;
          rank_name: string;
          rank_order: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          badge_color?: string | null;
          created_at?: string;
          id?: string;
          min_total_spend?: number | null;
          min_visits?: number | null;
          rank_name: string;
          rank_order: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          badge_color?: string | null;
          created_at?: string;
          id?: string;
          min_total_spend?: number | null;
          min_visits?: number | null;
          rank_name?: string;
          rank_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_rank_rules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_sessions: {
        Row: {
          created_at: string;
          customer_id: string | null;
          email: string | null;
          expires_at: string;
          id: string;
          phone_last4: string | null;
          phone_last4_hash: string | null;
          phone_last4_plain: string | null;
          revoked_at: string | null;
          session_hash: string;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          customer_id?: string | null;
          email?: string | null;
          expires_at: string;
          id?: string;
          phone_last4?: string | null;
          phone_last4_hash?: string | null;
          phone_last4_plain?: string | null;
          revoked_at?: string | null;
          session_hash: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          customer_id?: string | null;
          email?: string | null;
          expires_at?: string;
          id?: string;
          phone_last4?: string | null;
          phone_last4_hash?: string | null;
          phone_last4_plain?: string | null;
          revoked_at?: string | null;
          session_hash?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_sessions_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_sessions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          address: string | null;
          basic_contract_status: string;
          billing_cycle: string | null;
          billing_terms_note: string | null;
          birth_date: string | null;
          closing_day: number | null;
          contact_provenance: string | null;
          contact_verified_at: string | null;
          contact_verified_via: string | null;
          corporate_number: string | null;
          created_at: string | null;
          customer_type: string;
          document_delivery_method: string | null;
          email: string | null;
          external_ref: string | null;
          followup_opt_out: boolean;
          honorific: string | null;
          id: string;
          invoice_registration_number: string | null;
          last_synced_at: string | null;
          line_link_source: string | null;
          line_link_status: string;
          line_linked_at: string | null;
          line_unlink_reason: string | null;
          line_unlinked_at: string | null;
          line_user_id: string | null;
          linked_tenant_id: string | null;
          name: string;
          name_kana: string | null;
          nda_status: string;
          note: string | null;
          payment_terms_days: number | null;
          phone: string | null;
          phone_full_hash: string | null;
          postal_code: string | null;
          rank_id: string | null;
          share_availability: boolean;
          short_name: string | null;
          source_system: string | null;
          tenant_id: string;
          total_spend: number | null;
          transfer_fee_payer: string | null;
          updated_at: string | null;
          visit_count: number | null;
        };
        Insert: {
          address?: string | null;
          basic_contract_status?: string;
          billing_cycle?: string | null;
          billing_terms_note?: string | null;
          birth_date?: string | null;
          closing_day?: number | null;
          contact_provenance?: string | null;
          contact_verified_at?: string | null;
          contact_verified_via?: string | null;
          corporate_number?: string | null;
          created_at?: string | null;
          customer_type?: string;
          document_delivery_method?: string | null;
          email?: string | null;
          external_ref?: string | null;
          followup_opt_out?: boolean;
          honorific?: string | null;
          id?: string;
          invoice_registration_number?: string | null;
          last_synced_at?: string | null;
          line_link_source?: string | null;
          line_link_status?: string;
          line_linked_at?: string | null;
          line_unlink_reason?: string | null;
          line_unlinked_at?: string | null;
          line_user_id?: string | null;
          linked_tenant_id?: string | null;
          name: string;
          name_kana?: string | null;
          nda_status?: string;
          note?: string | null;
          payment_terms_days?: number | null;
          phone?: string | null;
          phone_full_hash?: string | null;
          postal_code?: string | null;
          rank_id?: string | null;
          share_availability?: boolean;
          short_name?: string | null;
          source_system?: string | null;
          tenant_id: string;
          total_spend?: number | null;
          transfer_fee_payer?: string | null;
          updated_at?: string | null;
          visit_count?: number | null;
        };
        Update: {
          address?: string | null;
          basic_contract_status?: string;
          billing_cycle?: string | null;
          billing_terms_note?: string | null;
          birth_date?: string | null;
          closing_day?: number | null;
          contact_provenance?: string | null;
          contact_verified_at?: string | null;
          contact_verified_via?: string | null;
          corporate_number?: string | null;
          created_at?: string | null;
          customer_type?: string;
          document_delivery_method?: string | null;
          email?: string | null;
          external_ref?: string | null;
          followup_opt_out?: boolean;
          honorific?: string | null;
          id?: string;
          invoice_registration_number?: string | null;
          last_synced_at?: string | null;
          line_link_source?: string | null;
          line_link_status?: string;
          line_linked_at?: string | null;
          line_unlink_reason?: string | null;
          line_unlinked_at?: string | null;
          line_user_id?: string | null;
          linked_tenant_id?: string | null;
          name?: string;
          name_kana?: string | null;
          nda_status?: string;
          note?: string | null;
          payment_terms_days?: number | null;
          phone?: string | null;
          phone_full_hash?: string | null;
          postal_code?: string | null;
          rank_id?: string | null;
          share_availability?: boolean;
          short_name?: string | null;
          source_system?: string | null;
          tenant_id?: string;
          total_spend?: number | null;
          transfer_fee_payer?: string | null;
          updated_at?: string | null;
          visit_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "customers_linked_tenant_id_fkey";
            columns: ["linked_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customers_rank_id_fkey";
            columns: ["rank_id"];
            isOneToOne: false;
            referencedRelation: "customer_rank_rules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      dealer_users: {
        Row: {
          created_at: string;
          dealer_id: string;
          id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          dealer_id: string;
          id?: string;
          role?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          dealer_id?: string;
          id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dealer_users_dealer_id_fkey";
            columns: ["dealer_id"];
            isOneToOne: false;
            referencedRelation: "dealers";
            referencedColumns: ["id"];
          },
        ];
      };
      dealers: {
        Row: {
          address: string | null;
          approved_at: string | null;
          company_name: string;
          contact_name: string | null;
          created_at: string;
          id: string;
          invite_code: string | null;
          phone: string | null;
          prefecture: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          approved_at?: string | null;
          company_name: string;
          contact_name?: string | null;
          created_at?: string;
          id?: string;
          invite_code?: string | null;
          phone?: string | null;
          prefecture?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          approved_at?: string | null;
          company_name?: string;
          contact_name?: string | null;
          created_at?: string;
          id?: string;
          invite_code?: string | null;
          phone?: string | null;
          prefecture?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      deals: {
        Row: {
          agreed_price: number | null;
          buyer_dealer_id: string;
          created_at: string;
          id: string;
          inquiry_id: string | null;
          listing_id: string;
          notes: string | null;
          seller_dealer_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          agreed_price?: number | null;
          buyer_dealer_id: string;
          created_at?: string;
          id?: string;
          inquiry_id?: string | null;
          listing_id: string;
          notes?: string | null;
          seller_dealer_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          agreed_price?: number | null;
          buyer_dealer_id?: string;
          created_at?: string;
          id?: string;
          inquiry_id?: string | null;
          listing_id?: string;
          notes?: string | null;
          seller_dealer_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deals_buyer_dealer_id_fkey";
            columns: ["buyer_dealer_id"];
            isOneToOne: false;
            referencedRelation: "dealers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_inquiry_id_fkey";
            columns: ["inquiry_id"];
            isOneToOne: false;
            referencedRelation: "listing_inquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "inventory_listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_seller_dealer_id_fkey";
            columns: ["seller_dealer_id"];
            isOneToOne: false;
            referencedRelation: "dealers";
            referencedColumns: ["id"];
          },
        ];
      };
      delivery_receipts: {
        Row: {
          anchor_tx_hash: string | null;
          anchored_at: string | null;
          cancel_reason: string | null;
          cancelled_at: string | null;
          certificate_id: string;
          created_at: string;
          created_by: string | null;
          device_fingerprint_json: Json | null;
          id: string;
          receipt_payload_json: Json;
          receipt_pdf_path: string | null;
          reservation_id: string | null;
          signature_session_id: string | null;
          signed_at: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          anchor_tx_hash?: string | null;
          anchored_at?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          certificate_id: string;
          created_at?: string;
          created_by?: string | null;
          device_fingerprint_json?: Json | null;
          id?: string;
          receipt_payload_json?: Json;
          receipt_pdf_path?: string | null;
          reservation_id?: string | null;
          signature_session_id?: string | null;
          signed_at?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          anchor_tx_hash?: string | null;
          anchored_at?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          certificate_id?: string;
          created_at?: string;
          created_by?: string | null;
          device_fingerprint_json?: Json | null;
          id?: string;
          receipt_payload_json?: Json;
          receipt_pdf_path?: string | null;
          reservation_id?: string | null;
          signature_session_id?: string | null;
          signed_at?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_receipts_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delivery_receipts_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delivery_receipts_signature_session_id_fkey";
            columns: ["signature_session_id"];
            isOneToOne: true;
            referencedRelation: "signature_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delivery_receipts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      document_share_log: {
        Row: {
          channel: string;
          document_id: string;
          error_message: string | null;
          id: string;
          idempotency_key: string | null;
          recipient: string;
          sent_at: string;
          sent_by: string | null;
          status: string | null;
          tenant_id: string;
        };
        Insert: {
          channel: string;
          document_id: string;
          error_message?: string | null;
          id?: string;
          idempotency_key?: string | null;
          recipient: string;
          sent_at?: string;
          sent_by?: string | null;
          status?: string | null;
          tenant_id: string;
        };
        Update: {
          channel?: string;
          document_id?: string;
          error_message?: string | null;
          id?: string;
          idempotency_key?: string | null;
          recipient?: string;
          sent_at?: string;
          sent_by?: string | null;
          status?: string | null;
          tenant_id?: string;
        };
        Relationships: [];
      };
      document_templates: {
        Row: {
          created_at: string | null;
          doc_type: string | null;
          id: string;
          is_default: boolean;
          layout_config: Json;
          name: string;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          doc_type?: string | null;
          id?: string;
          is_default?: boolean;
          layout_config?: Json;
          name: string;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          doc_type?: string | null;
          id?: string;
          is_default?: boolean;
          layout_config?: Json;
          name?: string;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "document_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          assigned_user_id: string | null;
          counterparty_tenant_id: string | null;
          created_at: string | null;
          customer_id: string | null;
          delivery_date: string | null;
          doc_number: string;
          doc_type: string;
          due_date: string | null;
          id: string;
          is_invoice_compliant: boolean;
          issued_at: string;
          items_json: Json;
          job_order_id: string | null;
          job_status: string;
          meta_json: Json | null;
          note: string | null;
          payment_date: string | null;
          payment_terms: string | null;
          period_end: string | null;
          period_start: string | null;
          recipient_address: string | null;
          recipient_honorific: string;
          recipient_name: string | null;
          recipient_phone: string | null;
          recipient_postal_code: string | null;
          show_bank_info: boolean;
          show_logo: boolean;
          show_seal: boolean;
          source_document_id: string | null;
          staff_member_id: string | null;
          status: string;
          subject: string | null;
          subtotal: number;
          tax: number;
          tax_breakdown: Json | null;
          tax_rate: number;
          template_id: string | null;
          tenant_id: string;
          total: number;
          updated_at: string | null;
          vehicle_id: string | null;
          vehicle_info_json: Json | null;
        };
        Insert: {
          assigned_user_id?: string | null;
          counterparty_tenant_id?: string | null;
          created_at?: string | null;
          customer_id?: string | null;
          delivery_date?: string | null;
          doc_number: string;
          doc_type: string;
          due_date?: string | null;
          id?: string;
          is_invoice_compliant?: boolean;
          issued_at?: string;
          items_json?: Json;
          job_order_id?: string | null;
          job_status?: string;
          meta_json?: Json | null;
          note?: string | null;
          payment_date?: string | null;
          payment_terms?: string | null;
          period_end?: string | null;
          period_start?: string | null;
          recipient_address?: string | null;
          recipient_honorific?: string;
          recipient_name?: string | null;
          recipient_phone?: string | null;
          recipient_postal_code?: string | null;
          show_bank_info?: boolean;
          show_logo?: boolean;
          show_seal?: boolean;
          source_document_id?: string | null;
          staff_member_id?: string | null;
          status?: string;
          subject?: string | null;
          subtotal?: number;
          tax?: number;
          tax_breakdown?: Json | null;
          tax_rate?: number;
          template_id?: string | null;
          tenant_id: string;
          total?: number;
          updated_at?: string | null;
          vehicle_id?: string | null;
          vehicle_info_json?: Json | null;
        };
        Update: {
          assigned_user_id?: string | null;
          counterparty_tenant_id?: string | null;
          created_at?: string | null;
          customer_id?: string | null;
          delivery_date?: string | null;
          doc_number?: string;
          doc_type?: string;
          due_date?: string | null;
          id?: string;
          is_invoice_compliant?: boolean;
          issued_at?: string;
          items_json?: Json;
          job_order_id?: string | null;
          job_status?: string;
          meta_json?: Json | null;
          note?: string | null;
          payment_date?: string | null;
          payment_terms?: string | null;
          period_end?: string | null;
          period_start?: string | null;
          recipient_address?: string | null;
          recipient_honorific?: string;
          recipient_name?: string | null;
          recipient_phone?: string | null;
          recipient_postal_code?: string | null;
          show_bank_info?: boolean;
          show_logo?: boolean;
          show_seal?: boolean;
          source_document_id?: string | null;
          staff_member_id?: string | null;
          status?: string;
          subject?: string | null;
          subtotal?: number;
          tax?: number;
          tax_breakdown?: Json | null;
          tax_rate?: number;
          template_id?: string | null;
          tenant_id?: string;
          total?: number;
          updated_at?: string | null;
          vehicle_id?: string | null;
          vehicle_info_json?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "documents_counterparty_tenant_id_fkey";
            columns: ["counterparty_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_job_order_id_fkey";
            columns: ["job_order_id"];
            isOneToOne: false;
            referencedRelation: "job_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_source_document_id_fkey";
            columns: ["source_document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_source_document_id_fkey";
            columns: ["source_document_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_staff_member_id_fkey";
            columns: ["staff_member_id"];
            isOneToOne: false;
            referencedRelation: "staff_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "document_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
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
      edge_devices: {
        Row: {
          device_key_hash: string;
          display_name: string;
          firmware_version: string | null;
          id: string;
          kind: string;
          last_seen_at: string | null;
          metadata: Json;
          registered_at: string;
          status: string;
          tenant_id: string;
        };
        Insert: {
          device_key_hash: string;
          display_name: string;
          firmware_version?: string | null;
          id?: string;
          kind: string;
          last_seen_at?: string | null;
          metadata?: Json;
          registered_at?: string;
          status?: string;
          tenant_id: string;
        };
        Update: {
          device_key_hash?: string;
          display_name?: string;
          firmware_version?: string | null;
          id?: string;
          kind?: string;
          last_seen_at?: string | null;
          metadata?: Json;
          registered_at?: string;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "edge_devices_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      edge_events: {
        Row: {
          content_hash: string;
          device_event_id: string;
          device_id: string;
          device_timestamp: string;
          id: string;
          job_order_id: string | null;
          kind: string;
          payload: Json;
          polygon_anchored_at: string | null;
          polygon_network: string | null;
          polygon_tx_hash: string | null;
          received_at: string;
          tenant_id: string;
          vehicle_id: string | null;
        };
        Insert: {
          content_hash: string;
          device_event_id: string;
          device_id: string;
          device_timestamp: string;
          id?: string;
          job_order_id?: string | null;
          kind: string;
          payload?: Json;
          polygon_anchored_at?: string | null;
          polygon_network?: string | null;
          polygon_tx_hash?: string | null;
          received_at?: string;
          tenant_id: string;
          vehicle_id?: string | null;
        };
        Update: {
          content_hash?: string;
          device_event_id?: string;
          device_id?: string;
          device_timestamp?: string;
          id?: string;
          job_order_id?: string | null;
          kind?: string;
          payload?: Json;
          polygon_anchored_at?: string | null;
          polygon_network?: string | null;
          polygon_tx_hash?: string | null;
          received_at?: string;
          tenant_id?: string;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "edge_events_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "edge_devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "edge_events_job_order_id_fkey";
            columns: ["job_order_id"];
            isOneToOne: false;
            referencedRelation: "job_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "edge_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "edge_events_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      equipment_master: {
        Row: {
          category: string;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          sort_order: number | null;
          tenant_id: string | null;
        };
        Insert: {
          category: string;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          sort_order?: number | null;
          tenant_id?: string | null;
        };
        Update: {
          category?: string;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          sort_order?: number | null;
          tenant_id?: string | null;
        };
        Relationships: [];
      };
      error_events: {
        Row: {
          context: Json;
          created_at: string;
          fingerprint: string | null;
          id: string;
          level: string;
          message: string;
          occurred_at: string;
          request_id: string | null;
          route: string | null;
          source: string;
          tenant_id: string | null;
        };
        Insert: {
          context?: Json;
          created_at?: string;
          fingerprint?: string | null;
          id?: string;
          level?: string;
          message: string;
          occurred_at?: string;
          request_id?: string | null;
          route?: string | null;
          source?: string;
          tenant_id?: string | null;
        };
        Update: {
          context?: Json;
          created_at?: string;
          fingerprint?: string | null;
          id?: string;
          level?: string;
          message?: string;
          occurred_at?: string;
          request_id?: string | null;
          route?: string | null;
          source?: string;
          tenant_id?: string | null;
        };
        Relationships: [];
      };
      external_booking_slots: {
        Row: {
          accepted_categories: string[] | null;
          created_at: string | null;
          day_of_week: number;
          end_time: string;
          id: string;
          is_active: boolean | null;
          label: string | null;
          max_bookings: number;
          start_time: string;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          accepted_categories?: string[] | null;
          created_at?: string | null;
          day_of_week: number;
          end_time: string;
          id?: string;
          is_active?: boolean | null;
          label?: string | null;
          max_bookings?: number;
          start_time: string;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          accepted_categories?: string[] | null;
          created_at?: string | null;
          day_of_week?: number;
          end_time?: string;
          id?: string;
          is_active?: boolean | null;
          label?: string | null;
          max_bookings?: number;
          start_time?: string;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "external_booking_slots_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      feature_metrics_weekly: {
        Row: {
          arr_jpy: number;
          computed_at: string;
          dau: number;
          failure: number;
          feature_id: string;
          success: number;
          support_load: number;
          tenant_id: string;
          wau: number;
          week_start: string;
        };
        Insert: {
          arr_jpy?: number;
          computed_at?: string;
          dau?: number;
          failure?: number;
          feature_id: string;
          success?: number;
          support_load?: number;
          tenant_id: string;
          wau?: number;
          week_start: string;
        };
        Update: {
          arr_jpy?: number;
          computed_at?: string;
          dau?: number;
          failure?: number;
          feature_id?: string;
          success?: number;
          support_load?: number;
          tenant_id?: string;
          wau?: number;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feature_metrics_weekly_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      follow_up_settings: {
        Row: {
          birthday_enabled: boolean;
          birthday_lead_days: number;
          created_at: string | null;
          enabled: boolean | null;
          first_reminder_days: number;
          follow_up_days_after: number[] | null;
          id: string;
          inspection_pre_days: number;
          maintenance_reminder_months: number[];
          maintenance_schedule_by_service: Json;
          reminder_days_before: number[] | null;
          seasonal_enabled: boolean;
          send_on_issue: boolean;
          tenant_id: string;
          updated_at: string | null;
          warranty_end_days: number;
        };
        Insert: {
          birthday_enabled?: boolean;
          birthday_lead_days?: number;
          created_at?: string | null;
          enabled?: boolean | null;
          first_reminder_days?: number;
          follow_up_days_after?: number[] | null;
          id?: string;
          inspection_pre_days?: number;
          maintenance_reminder_months?: number[];
          maintenance_schedule_by_service?: Json;
          reminder_days_before?: number[] | null;
          seasonal_enabled?: boolean;
          send_on_issue?: boolean;
          tenant_id: string;
          updated_at?: string | null;
          warranty_end_days?: number;
        };
        Update: {
          birthday_enabled?: boolean;
          birthday_lead_days?: number;
          created_at?: string | null;
          enabled?: boolean | null;
          first_reminder_days?: number;
          follow_up_days_after?: number[] | null;
          id?: string;
          inspection_pre_days?: number;
          maintenance_reminder_months?: number[];
          maintenance_schedule_by_service?: Json;
          reminder_days_before?: number[] | null;
          seasonal_enabled?: boolean;
          send_on_issue?: boolean;
          tenant_id?: string;
          updated_at?: string | null;
          warranty_end_days?: number;
        };
        Relationships: [
          {
            foreignKeyName: "follow_up_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      gcal_sync_log: {
        Row: {
          action: string;
          created_at: string | null;
          error_message: string | null;
          gcal_event_id: string | null;
          id: string;
          reservation_id: string | null;
          status: string;
          tenant_id: string;
        };
        Insert: {
          action: string;
          created_at?: string | null;
          error_message?: string | null;
          gcal_event_id?: string | null;
          id?: string;
          reservation_id?: string | null;
          status?: string;
          tenant_id: string;
        };
        Update: {
          action?: string;
          created_at?: string | null;
          error_message?: string | null;
          gcal_event_id?: string | null;
          id?: string;
          reservation_id?: string | null;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gcal_sync_log_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gcal_sync_log_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      global_line_knowledge: {
        Row: {
          content: string;
          created_at: string;
          created_by: string | null;
          enabled: boolean;
          id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          id?: string;
          title?: string;
          updated_at?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      hearings: {
        Row: {
          additional_requests: string | null;
          budget_range: string | null;
          coating_history: string | null;
          concern_areas: string | null;
          created_at: string;
          customer_email: string | null;
          customer_id: string | null;
          customer_name: string;
          customer_phone: string | null;
          desired_menu: string | null;
          hearing_json: Json | null;
          id: string;
          parking_environment: string | null;
          scratches_dents: string | null;
          service_type: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          usage_frequency: string | null;
          vehicle_color: string | null;
          vehicle_id: string | null;
          vehicle_maker: string | null;
          vehicle_model: string | null;
          vehicle_plate: string | null;
          vehicle_size: string | null;
          vehicle_vin: string | null;
          vehicle_year: number | null;
        };
        Insert: {
          additional_requests?: string | null;
          budget_range?: string | null;
          coating_history?: string | null;
          concern_areas?: string | null;
          created_at?: string;
          customer_email?: string | null;
          customer_id?: string | null;
          customer_name?: string;
          customer_phone?: string | null;
          desired_menu?: string | null;
          hearing_json?: Json | null;
          id?: string;
          parking_environment?: string | null;
          scratches_dents?: string | null;
          service_type?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          usage_frequency?: string | null;
          vehicle_color?: string | null;
          vehicle_id?: string | null;
          vehicle_maker?: string | null;
          vehicle_model?: string | null;
          vehicle_plate?: string | null;
          vehicle_size?: string | null;
          vehicle_vin?: string | null;
          vehicle_year?: number | null;
        };
        Update: {
          additional_requests?: string | null;
          budget_range?: string | null;
          coating_history?: string | null;
          concern_areas?: string | null;
          created_at?: string;
          customer_email?: string | null;
          customer_id?: string | null;
          customer_name?: string;
          customer_phone?: string | null;
          desired_menu?: string | null;
          hearing_json?: Json | null;
          id?: string;
          parking_environment?: string | null;
          scratches_dents?: string | null;
          service_type?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          usage_frequency?: string | null;
          vehicle_color?: string | null;
          vehicle_id?: string | null;
          vehicle_maker?: string | null;
          vehicle_model?: string | null;
          vehicle_plate?: string | null;
          vehicle_size?: string | null;
          vehicle_vin?: string | null;
          vehicle_year?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "hearings_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hearings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hearings_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      industry_news: {
        Row: {
          body: string;
          category: string;
          created_at: string;
          id: string;
          is_published: boolean;
          public_id: string;
          published_at: string | null;
          source_url: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          category?: string;
          created_at?: string;
          id?: string;
          is_published?: boolean;
          public_id: string;
          published_at?: string | null;
          source_url?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          category?: string;
          created_at?: string;
          id?: string;
          is_published?: boolean;
          public_id?: string;
          published_at?: string | null;
          source_url?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inquiry_messages: {
        Row: {
          created_at: string;
          id: string;
          inquiry_id: string;
          message: string;
          sender_dealer_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          inquiry_id: string;
          message: string;
          sender_dealer_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          inquiry_id?: string;
          message?: string;
          sender_dealer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inquiry_messages_inquiry_id_fkey";
            columns: ["inquiry_id"];
            isOneToOne: false;
            referencedRelation: "listing_inquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inquiry_messages_sender_dealer_id_fkey";
            columns: ["sender_dealer_id"];
            isOneToOne: false;
            referencedRelation: "dealers";
            referencedColumns: ["id"];
          },
        ];
      };
      inspection_records: {
        Row: {
          answers: Json;
          created_at: string;
          customer_id: string | null;
          id: string;
          inspected_at: string;
          inspection_type: string;
          inspector_name: string | null;
          notes: string | null;
          photo_urls: Json;
          reservation_id: string | null;
          template_id: string | null;
          template_items: Json;
          template_name: string | null;
          tenant_id: string;
          updated_at: string;
          vehicle_id: string | null;
        };
        Insert: {
          answers?: Json;
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          inspected_at?: string;
          inspection_type?: string;
          inspector_name?: string | null;
          notes?: string | null;
          photo_urls?: Json;
          reservation_id?: string | null;
          template_id?: string | null;
          template_items?: Json;
          template_name?: string | null;
          tenant_id: string;
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Update: {
          answers?: Json;
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          inspected_at?: string;
          inspection_type?: string;
          inspector_name?: string | null;
          notes?: string | null;
          photo_urls?: Json;
          reservation_id?: string | null;
          template_id?: string | null;
          template_items?: Json;
          template_name?: string | null;
          tenant_id?: string;
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inspection_records_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inspection_records_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inspection_records_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "inspection_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inspection_records_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inspection_records_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      inspection_templates: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          is_default: boolean;
          items: Json;
          name: string;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          items?: Json;
          name: string;
          sort_order?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          items?: Json;
          name?: string;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inspection_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      insurer_access_logs: {
        Row: {
          action: string;
          certificate_id: string | null;
          created_at: string;
          id: string;
          insurer_id: string;
          insurer_user_id: string;
          ip: string | null;
          meta: Json;
          tenant_id: string | null;
          user_agent: string | null;
        };
        Insert: {
          action: string;
          certificate_id?: string | null;
          created_at?: string;
          id?: string;
          insurer_id: string;
          insurer_user_id: string;
          ip?: string | null;
          meta?: Json;
          tenant_id?: string | null;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          certificate_id?: string | null;
          created_at?: string;
          id?: string;
          insurer_id?: string;
          insurer_user_id?: string;
          ip?: string | null;
          meta?: Json;
          tenant_id?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_ial_insurer";
            columns: ["insurer_id"];
            isOneToOne: false;
            referencedRelation: "insurers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_ial_insurer_user";
            columns: ["insurer_user_id"];
            isOneToOne: false;
            referencedRelation: "insurer_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_ial_insurer_user";
            columns: ["insurer_user_id"];
            isOneToOne: false;
            referencedRelation: "v_insurer_users_list";
            referencedColumns: ["insurer_user_id"];
          },
          {
            foreignKeyName: "insurer_access_logs_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurer_access_logs_insurer_user_fk";
            columns: ["insurer_user_id"];
            isOneToOne: false;
            referencedRelation: "insurer_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurer_access_logs_insurer_user_fk";
            columns: ["insurer_user_id"];
            isOneToOne: false;
            referencedRelation: "v_insurer_users_list";
            referencedColumns: ["insurer_user_id"];
          },
        ];
      };
      insurer_assignment_rules: {
        Row: {
          assign_to: string;
          condition_type: string;
          condition_value: string;
          created_at: string;
          id: string;
          insurer_id: string;
          is_active: boolean;
          name: string;
        };
        Insert: {
          assign_to: string;
          condition_type: string;
          condition_value?: string;
          created_at?: string;
          id?: string;
          insurer_id: string;
          is_active?: boolean;
          name?: string;
        };
        Update: {
          assign_to?: string;
          condition_type?: string;
          condition_value?: string;
          created_at?: string;
          id?: string;
          insurer_id?: string;
          is_active?: boolean;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "insurer_assignment_rules_assign_to_fkey";
            columns: ["assign_to"];
            isOneToOne: false;
            referencedRelation: "insurer_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurer_assignment_rules_assign_to_fkey";
            columns: ["assign_to"];
            isOneToOne: false;
            referencedRelation: "v_insurer_users_list";
            referencedColumns: ["insurer_user_id"];
          },
          {
            foreignKeyName: "insurer_assignment_rules_insurer_id_fkey";
            columns: ["insurer_id"];
            isOneToOne: false;
            referencedRelation: "insurers";
            referencedColumns: ["id"];
          },
        ];
      };
      insurer_case_attachments: {
        Row: {
          case_id: string;
          created_at: string;
          file_name: string;
          file_size: number | null;
          file_type: string | null;
          id: string;
          message_id: string | null;
          storage_path: string;
          uploaded_by: string | null;
        };
        Insert: {
          case_id: string;
          created_at?: string;
          file_name: string;
          file_size?: number | null;
          file_type?: string | null;
          id?: string;
          message_id?: string | null;
          storage_path: string;
          uploaded_by?: string | null;
        };
        Update: {
          case_id?: string;
          created_at?: string;
          file_name?: string;
          file_size?: number | null;
          file_type?: string | null;
          id?: string;
          message_id?: string | null;
          storage_path?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "insurer_case_attachments_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "insurer_cases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurer_case_attachments_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "insurer_case_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      insurer_case_messages: {
        Row: {
          case_id: string;
          content: string;
          created_at: string;
          id: string;
          meta: Json | null;
          sender_id: string;
          sender_type: string;
        };
        Insert: {
          case_id: string;
          content: string;
          created_at?: string;
          id?: string;
          meta?: Json | null;
          sender_id: string;
          sender_type?: string;
        };
        Update: {
          case_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
          meta?: Json | null;
          sender_id?: string;
          sender_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "insurer_case_messages_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "insurer_cases";
            referencedColumns: ["id"];
          },
        ];
      };
      insurer_case_templates: {
        Row: {
          category: string;
          created_at: string;
          created_by: string | null;
          default_priority: string;
          description_template: string;
          id: string;
          insurer_id: string;
          name: string;
          title_template: string;
        };
        Insert: {
          category?: string;
          created_at?: string;
          created_by?: string | null;
          default_priority?: string;
          description_template?: string;
          id?: string;
          insurer_id: string;
          name: string;
          title_template?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          created_by?: string | null;
          default_priority?: string;
          description_template?: string;
          id?: string;
          insurer_id?: string;
          name?: string;
          title_template?: string;
        };
        Relationships: [
          {
            foreignKeyName: "insurer_case_templates_insurer_id_fkey";
            columns: ["insurer_id"];
            isOneToOne: false;
            referencedRelation: "insurers";
            referencedColumns: ["id"];
          },
        ];
      };
      insurer_cases: {
        Row: {
          assigned_to: string | null;
          case_number: string;
          category: string | null;
          certificate_id: string | null;
          closed_at: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          insurer_id: string;
          meta: Json | null;
          priority: string;
          resolved_at: string | null;
          status: string;
          tenant_id: string | null;
          title: string;
          updated_at: string;
          vehicle_id: string | null;
        };
        Insert: {
          assigned_to?: string | null;
          case_number: string;
          category?: string | null;
          certificate_id?: string | null;
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          insurer_id: string;
          meta?: Json | null;
          priority?: string;
          resolved_at?: string | null;
          status?: string;
          tenant_id?: string | null;
          title: string;
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Update: {
          assigned_to?: string | null;
          case_number?: string;
          category?: string | null;
          certificate_id?: string | null;
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          insurer_id?: string;
          meta?: Json | null;
          priority?: string;
          resolved_at?: string | null;
          status?: string;
          tenant_id?: string | null;
          title?: string;
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "insurer_cases_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "insurer_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurer_cases_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "v_insurer_users_list";
            referencedColumns: ["insurer_user_id"];
          },
          {
            foreignKeyName: "insurer_cases_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurer_cases_insurer_id_fkey";
            columns: ["insurer_id"];
            isOneToOne: false;
            referencedRelation: "insurers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurer_cases_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurer_cases_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      insurer_email_verifications: {
        Row: {
          attempts: number;
          code: string;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          verified: boolean;
        };
        Insert: {
          attempts?: number;
          code: string;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          verified?: boolean;
        };
        Update: {
          attempts?: number;
          code?: string;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          verified?: boolean;
        };
        Relationships: [];
      };
      insurer_notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          insurer_id: string;
          is_read: boolean;
          link: string | null;
          title: string;
          type: string;
          user_id: string | null;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          insurer_id: string;
          is_read?: boolean;
          link?: string | null;
          title: string;
          type?: string;
          user_id?: string | null;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          insurer_id?: string;
          is_read?: boolean;
          link?: string | null;
          title?: string;
          type?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "insurer_notifications_insurer_id_fkey";
            columns: ["insurer_id"];
            isOneToOne: false;
            referencedRelation: "insurers";
            referencedColumns: ["id"];
          },
        ];
      };
      insurer_saved_searches: {
        Row: {
          created_at: string;
          date_from: string | null;
          date_to: string | null;
          id: string;
          insurer_id: string;
          name: string;
          query: string | null;
          status_filter: string | null;
        };
        Insert: {
          created_at?: string;
          date_from?: string | null;
          date_to?: string | null;
          id?: string;
          insurer_id: string;
          name: string;
          query?: string | null;
          status_filter?: string | null;
        };
        Update: {
          created_at?: string;
          date_from?: string | null;
          date_to?: string | null;
          id?: string;
          insurer_id?: string;
          name?: string;
          query?: string | null;
          status_filter?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "insurer_saved_searches_insurer_id_fkey";
            columns: ["insurer_id"];
            isOneToOne: false;
            referencedRelation: "insurers";
            referencedColumns: ["id"];
          },
        ];
      };
      insurer_security_settings: {
        Row: {
          id: string;
          insurer_id: string;
          ip_whitelist: string[] | null;
          ip_whitelist_enabled: boolean;
          session_timeout_minutes: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          insurer_id: string;
          ip_whitelist?: string[] | null;
          ip_whitelist_enabled?: boolean;
          session_timeout_minutes?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          insurer_id?: string;
          ip_whitelist?: string[] | null;
          ip_whitelist_enabled?: boolean;
          session_timeout_minutes?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "insurer_security_settings_insurer_id_fkey";
            columns: ["insurer_id"];
            isOneToOne: true;
            referencedRelation: "insurers";
            referencedColumns: ["id"];
          },
        ];
      };
      insurer_sla_config: {
        Row: {
          high_hours: number;
          id: string;
          insurer_id: string;
          low_hours: number;
          normal_hours: number;
          updated_at: string;
          updated_by: string | null;
          urgent_hours: number;
        };
        Insert: {
          high_hours?: number;
          id?: string;
          insurer_id: string;
          low_hours?: number;
          normal_hours?: number;
          updated_at?: string;
          updated_by?: string | null;
          urgent_hours?: number;
        };
        Update: {
          high_hours?: number;
          id?: string;
          insurer_id?: string;
          low_hours?: number;
          normal_hours?: number;
          updated_at?: string;
          updated_by?: string | null;
          urgent_hours?: number;
        };
        Relationships: [
          {
            foreignKeyName: "insurer_sla_config_insurer_id_fkey";
            columns: ["insurer_id"];
            isOneToOne: true;
            referencedRelation: "insurers";
            referencedColumns: ["id"];
          },
        ];
      };
      insurer_subscriptions: {
        Row: {
          cancel_at_period_end: boolean;
          created_at: string;
          current_period_end: string | null;
          id: string;
          insurer_id: string;
          status: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          updated_at: string;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          insurer_id: string;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          updated_at?: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          insurer_id?: string;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "insurer_subscriptions_insurer_id_fkey";
            columns: ["insurer_id"];
            isOneToOne: true;
            referencedRelation: "insurers";
            referencedColumns: ["id"];
          },
        ];
      };
      insurer_tenant_access: {
        Row: {
          created_at: string;
          granted_at: string;
          granted_by: string | null;
          id: string;
          insurer_id: string;
          is_active: boolean;
          is_enabled: boolean;
          notes: string | null;
          revoked_at: string | null;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          insurer_id: string;
          is_active?: boolean;
          is_enabled?: boolean;
          notes?: string | null;
          revoked_at?: string | null;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          insurer_id?: string;
          is_active?: boolean;
          is_enabled?: boolean;
          notes?: string | null;
          revoked_at?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "insurer_tenant_access_insurer_id_fkey";
            columns: ["insurer_id"];
            isOneToOne: false;
            referencedRelation: "insurers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurer_tenant_access_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      insurer_tenant_contracts: {
        Row: {
          contracted_at: string;
          created_at: string;
          id: string;
          insurer_id: string;
          status: string;
          tenant_id: string;
          terminated_at: string | null;
          updated_at: string;
        };
        Insert: {
          contracted_at?: string;
          created_at?: string;
          id?: string;
          insurer_id: string;
          status?: string;
          tenant_id: string;
          terminated_at?: string | null;
          updated_at?: string;
        };
        Update: {
          contracted_at?: string;
          created_at?: string;
          id?: string;
          insurer_id?: string;
          status?: string;
          tenant_id?: string;
          terminated_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "insurer_tenant_contracts_insurer_id_fkey";
            columns: ["insurer_id"];
            isOneToOne: false;
            referencedRelation: "insurers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurer_tenant_contracts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      insurer_user_preferences: {
        Row: {
          id: string;
          insurer_id: string;
          preferences: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          insurer_id: string;
          preferences?: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          insurer_id?: string;
          preferences?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "insurer_user_preferences_insurer_id_fkey";
            columns: ["insurer_id"];
            isOneToOne: false;
            referencedRelation: "insurers";
            referencedColumns: ["id"];
          },
        ];
      };
      insurer_users: {
        Row: {
          created_at: string;
          created_by: string | null;
          display_name: string | null;
          email: string | null;
          id: string;
          insurer_id: string;
          is_active: boolean;
          last_login_at: string | null;
          note: string | null;
          role: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          display_name?: string | null;
          email?: string | null;
          id?: string;
          insurer_id: string;
          is_active?: boolean;
          last_login_at?: string | null;
          note?: string | null;
          role?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          display_name?: string | null;
          email?: string | null;
          id?: string;
          insurer_id?: string;
          is_active?: boolean;
          last_login_at?: string | null;
          note?: string | null;
          role?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "insurer_users_insurer_id_fkey";
            columns: ["insurer_id"];
            isOneToOne: false;
            referencedRelation: "insurers";
            referencedColumns: ["id"];
          },
        ];
      };
      insurer_watchlist: {
        Row: {
          created_at: string;
          id: string;
          insurer_id: string;
          target_id: string;
          target_type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          insurer_id: string;
          target_id: string;
          target_type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          insurer_id?: string;
          target_id?: string;
          target_type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "insurer_watchlist_insurer_id_fkey";
            columns: ["insurer_id"];
            isOneToOne: false;
            referencedRelation: "insurers";
            referencedColumns: ["id"];
          },
        ];
      };
      insurers: {
        Row: {
          activated_at: string | null;
          address: string | null;
          agency_id: string | null;
          business_type: string;
          contact_email: string | null;
          contact_person: string | null;
          contact_phone: string | null;
          corporate_number: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          onboarding_completed_at: string | null;
          plan_tier: string | null;
          referral_code: string | null;
          rejection_reason: string | null;
          representative_name: string | null;
          requested_plan: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          signup_source: string | null;
          slug: string;
          status: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          terms_accepted_at: string | null;
          updated_at: string;
        };
        Insert: {
          activated_at?: string | null;
          address?: string | null;
          agency_id?: string | null;
          business_type?: string;
          contact_email?: string | null;
          contact_person?: string | null;
          contact_phone?: string | null;
          corporate_number?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          onboarding_completed_at?: string | null;
          plan_tier?: string | null;
          referral_code?: string | null;
          rejection_reason?: string | null;
          representative_name?: string | null;
          requested_plan?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          signup_source?: string | null;
          slug: string;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          terms_accepted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          activated_at?: string | null;
          address?: string | null;
          agency_id?: string | null;
          business_type?: string;
          contact_email?: string | null;
          contact_person?: string | null;
          contact_phone?: string | null;
          corporate_number?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          onboarding_completed_at?: string | null;
          plan_tier?: string | null;
          referral_code?: string | null;
          rejection_reason?: string | null;
          representative_name?: string | null;
          requested_plan?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          signup_source?: string | null;
          slug?: string;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          terms_accepted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      integration_sync_runs: {
        Row: {
          api_key_id: string | null;
          created_at: string;
          error: string | null;
          failed: number;
          id: string;
          inserted: number;
          resource: string;
          source_system: string;
          status: string;
          tenant_id: string;
          total: number;
          updated: number;
        };
        Insert: {
          api_key_id?: string | null;
          created_at?: string;
          error?: string | null;
          failed?: number;
          id?: string;
          inserted?: number;
          resource: string;
          source_system: string;
          status?: string;
          tenant_id: string;
          total?: number;
          updated?: number;
        };
        Update: {
          api_key_id?: string | null;
          created_at?: string;
          error?: string | null;
          failed?: number;
          id?: string;
          inserted?: number;
          resource?: string;
          source_system?: string;
          status?: string;
          tenant_id?: string;
          total?: number;
          updated?: number;
        };
        Relationships: [
          {
            foreignKeyName: "integration_sync_runs_api_key_id_fkey";
            columns: ["api_key_id"];
            isOneToOne: false;
            referencedRelation: "tenant_api_keys";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "integration_sync_runs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_items: {
        Row: {
          barcode: string | null;
          category: string | null;
          created_at: string;
          current_stock: number;
          default_serial_tracked: boolean;
          gtin: string | null;
          id: string;
          is_active: boolean;
          min_stock: number;
          name: string;
          note: string | null;
          reorder_qty: number | null;
          sku: string | null;
          supplier_id: string | null;
          supplier_sku: string | null;
          supply_partner_product_id: string | null;
          tenant_id: string;
          unit: string;
          unit_cost: number | null;
          updated_at: string;
        };
        Insert: {
          barcode?: string | null;
          category?: string | null;
          created_at?: string;
          current_stock?: number;
          default_serial_tracked?: boolean;
          gtin?: string | null;
          id?: string;
          is_active?: boolean;
          min_stock?: number;
          name: string;
          note?: string | null;
          reorder_qty?: number | null;
          sku?: string | null;
          supplier_id?: string | null;
          supplier_sku?: string | null;
          supply_partner_product_id?: string | null;
          tenant_id: string;
          unit?: string;
          unit_cost?: number | null;
          updated_at?: string;
        };
        Update: {
          barcode?: string | null;
          category?: string | null;
          created_at?: string;
          current_stock?: number;
          default_serial_tracked?: boolean;
          gtin?: string | null;
          id?: string;
          is_active?: boolean;
          min_stock?: number;
          name?: string;
          note?: string | null;
          reorder_qty?: number | null;
          sku?: string | null;
          supplier_id?: string | null;
          supplier_sku?: string | null;
          supply_partner_product_id?: string | null;
          tenant_id?: string;
          unit?: string;
          unit_cost?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_items_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_items_supply_partner_product_id_fkey";
            columns: ["supply_partner_product_id"];
            isOneToOne: false;
            referencedRelation: "supply_partner_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_listings: {
        Row: {
          body_type: string | null;
          color: string | null;
          created_at: string;
          dealer_id: string;
          description: string | null;
          fuel_type: string | null;
          grade: string | null;
          has_repair_history: boolean;
          has_vehicle_inspection: boolean;
          id: string;
          inspection_expiry: string | null;
          make: string;
          mileage: number | null;
          model: string;
          notes: string | null;
          price: number | null;
          public_id: string;
          repair_history_notes: string | null;
          status: string;
          transmission: string | null;
          updated_at: string;
          year: number | null;
        };
        Insert: {
          body_type?: string | null;
          color?: string | null;
          created_at?: string;
          dealer_id: string;
          description?: string | null;
          fuel_type?: string | null;
          grade?: string | null;
          has_repair_history?: boolean;
          has_vehicle_inspection?: boolean;
          id?: string;
          inspection_expiry?: string | null;
          make: string;
          mileage?: number | null;
          model: string;
          notes?: string | null;
          price?: number | null;
          public_id: string;
          repair_history_notes?: string | null;
          status?: string;
          transmission?: string | null;
          updated_at?: string;
          year?: number | null;
        };
        Update: {
          body_type?: string | null;
          color?: string | null;
          created_at?: string;
          dealer_id?: string;
          description?: string | null;
          fuel_type?: string | null;
          grade?: string | null;
          has_repair_history?: boolean;
          has_vehicle_inspection?: boolean;
          id?: string;
          inspection_expiry?: string | null;
          make?: string;
          mileage?: number | null;
          model?: string;
          notes?: string | null;
          price?: number | null;
          public_id?: string;
          repair_history_notes?: string | null;
          status?: string;
          transmission?: string | null;
          updated_at?: string;
          year?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_listings_dealer_id_fkey";
            columns: ["dealer_id"];
            isOneToOne: false;
            referencedRelation: "dealers";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_movements: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          installation_id: string | null;
          item_id: string;
          quantity: number;
          reason: string | null;
          reservation_id: string | null;
          tenant_id: string;
          type: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          installation_id?: string | null;
          item_id: string;
          quantity: number;
          reason?: string | null;
          reservation_id?: string | null;
          tenant_id: string;
          type: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          installation_id?: string | null;
          item_id?: string;
          quantity?: number;
          reason?: string | null;
          reservation_id?: string | null;
          tenant_id?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_movements_installation_id_fkey";
            columns: ["installation_id"];
            isOneToOne: false;
            referencedRelation: "part_installations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      job_bids: {
        Row: {
          bid_price: number | null;
          bidder_dealer_id: string;
          created_at: string;
          id: string;
          job_order_id: string;
          message: string;
          status: string;
        };
        Insert: {
          bid_price?: number | null;
          bidder_dealer_id: string;
          created_at?: string;
          id?: string;
          job_order_id: string;
          message: string;
          status?: string;
        };
        Update: {
          bid_price?: number | null;
          bidder_dealer_id?: string;
          created_at?: string;
          id?: string;
          job_order_id?: string;
          message?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_bids_bidder_dealer_id_fkey";
            columns: ["bidder_dealer_id"];
            isOneToOne: false;
            referencedRelation: "dealers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_bids_job_order_id_fkey";
            columns: ["job_order_id"];
            isOneToOne: false;
            referencedRelation: "job_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      job_orders: {
        Row: {
          accepted_amount: number | null;
          billing_method: string;
          billing_timing: string;
          budget: number | null;
          budget_max: number | null;
          budget_min: number | null;
          cancel_reason: string | null;
          cancelled_by: string | null;
          category: string | null;
          city: string | null;
          client_approved_at: string | null;
          created_at: string;
          deadline: string | null;
          description: string | null;
          desired_date: string | null;
          from_tenant_id: string;
          id: string;
          inspection_signature_data_url: string | null;
          inspection_signed_at: string | null;
          inspection_signer_name: string | null;
          invoice_due_date: string | null;
          invoice_number: string | null;
          invoice_sent_at: string | null;
          order_number: string | null;
          payment_confirmed_by_client: boolean;
          payment_confirmed_by_vendor: boolean;
          payment_method: string | null;
          payment_status: string;
          payout_amount: number | null;
          payout_executed_at: string | null;
          payout_stripe_transfer_id: string | null;
          platform_fee_amount: number | null;
          platform_fee_rate: number;
          prefecture: string | null;
          public_id: string;
          requester_company: string | null;
          requester_email: string | null;
          reservation_id: string | null;
          service_category: string | null;
          status: string;
          title: string;
          to_tenant_id: string | null;
          updated_at: string;
          vehicle_id: string | null;
          vendor_completed_at: string | null;
        };
        Insert: {
          accepted_amount?: number | null;
          billing_method?: string;
          billing_timing?: string;
          budget?: number | null;
          budget_max?: number | null;
          budget_min?: number | null;
          cancel_reason?: string | null;
          cancelled_by?: string | null;
          category?: string | null;
          city?: string | null;
          client_approved_at?: string | null;
          created_at?: string;
          deadline?: string | null;
          description?: string | null;
          desired_date?: string | null;
          from_tenant_id: string;
          id?: string;
          inspection_signature_data_url?: string | null;
          inspection_signed_at?: string | null;
          inspection_signer_name?: string | null;
          invoice_due_date?: string | null;
          invoice_number?: string | null;
          invoice_sent_at?: string | null;
          order_number?: string | null;
          payment_confirmed_by_client?: boolean;
          payment_confirmed_by_vendor?: boolean;
          payment_method?: string | null;
          payment_status?: string;
          payout_amount?: number | null;
          payout_executed_at?: string | null;
          payout_stripe_transfer_id?: string | null;
          platform_fee_amount?: number | null;
          platform_fee_rate?: number;
          prefecture?: string | null;
          public_id?: string;
          requester_company?: string | null;
          requester_email?: string | null;
          reservation_id?: string | null;
          service_category?: string | null;
          status?: string;
          title: string;
          to_tenant_id?: string | null;
          updated_at?: string;
          vehicle_id?: string | null;
          vendor_completed_at?: string | null;
        };
        Update: {
          accepted_amount?: number | null;
          billing_method?: string;
          billing_timing?: string;
          budget?: number | null;
          budget_max?: number | null;
          budget_min?: number | null;
          cancel_reason?: string | null;
          cancelled_by?: string | null;
          category?: string | null;
          city?: string | null;
          client_approved_at?: string | null;
          created_at?: string;
          deadline?: string | null;
          description?: string | null;
          desired_date?: string | null;
          from_tenant_id?: string;
          id?: string;
          inspection_signature_data_url?: string | null;
          inspection_signed_at?: string | null;
          inspection_signer_name?: string | null;
          invoice_due_date?: string | null;
          invoice_number?: string | null;
          invoice_sent_at?: string | null;
          order_number?: string | null;
          payment_confirmed_by_client?: boolean;
          payment_confirmed_by_vendor?: boolean;
          payment_method?: string | null;
          payment_status?: string;
          payout_amount?: number | null;
          payout_executed_at?: string | null;
          payout_stripe_transfer_id?: string | null;
          platform_fee_amount?: number | null;
          platform_fee_rate?: number;
          prefecture?: string | null;
          public_id?: string;
          requester_company?: string | null;
          requester_email?: string | null;
          reservation_id?: string | null;
          service_category?: string | null;
          status?: string;
          title?: string;
          to_tenant_id?: string | null;
          updated_at?: string;
          vehicle_id?: string | null;
          vendor_completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "job_orders_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_orders_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      knowledge_chunks: {
        Row: {
          category: string | null;
          content: string;
          created_at: string;
          id: string;
          is_active: boolean;
          source_id: string | null;
          source_type: string;
          tags: string[];
          tenant_id: string | null;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          content: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          source_id?: string | null;
          source_type: string;
          tags?: string[];
          tenant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          content?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          source_id?: string | null;
          source_type?: string;
          tags?: string[];
          tenant_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      line_broadcasts: {
        Row: {
          created_at: string;
          created_by: string | null;
          failed_count: number | null;
          id: string;
          message_text: string;
          name: string;
          scheduled_at: string | null;
          segment_json: Json;
          sent_at: string | null;
          sent_count: number | null;
          status: string;
          target_count: number | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          failed_count?: number | null;
          id?: string;
          message_text: string;
          name: string;
          scheduled_at?: string | null;
          segment_json?: Json;
          sent_at?: string | null;
          sent_count?: number | null;
          status?: string;
          target_count?: number | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          failed_count?: number | null;
          id?: string;
          message_text?: string;
          name?: string;
          scheduled_at?: string | null;
          segment_json?: Json;
          sent_at?: string | null;
          sent_count?: number | null;
          status?: string;
          target_count?: number | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "line_broadcasts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      line_conversation_flows: {
        Row: {
          context_json: Json;
          created_at: string;
          customer_id: string | null;
          expires_at: string;
          id: string;
          invoice_doc_id: string | null;
          last_message_id: string | null;
          line_user_id: string | null;
          quote_doc_id: string | null;
          reservation_id: string | null;
          state: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          context_json?: Json;
          created_at?: string;
          customer_id?: string | null;
          expires_at: string;
          id?: string;
          invoice_doc_id?: string | null;
          last_message_id?: string | null;
          line_user_id?: string | null;
          quote_doc_id?: string | null;
          reservation_id?: string | null;
          state: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          context_json?: Json;
          created_at?: string;
          customer_id?: string | null;
          expires_at?: string;
          id?: string;
          invoice_doc_id?: string | null;
          last_message_id?: string | null;
          line_user_id?: string | null;
          quote_doc_id?: string | null;
          reservation_id?: string | null;
          state?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "line_conversation_flows_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "line_conversation_flows_invoice_doc_id_fkey";
            columns: ["invoice_doc_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "line_conversation_flows_invoice_doc_id_fkey";
            columns: ["invoice_doc_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "line_conversation_flows_last_message_id_fkey";
            columns: ["last_message_id"];
            isOneToOne: false;
            referencedRelation: "customer_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "line_conversation_flows_quote_doc_id_fkey";
            columns: ["quote_doc_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "line_conversation_flows_quote_doc_id_fkey";
            columns: ["quote_doc_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "line_conversation_flows_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "line_conversation_flows_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      line_follow_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: string;
          line_user_id: string;
          payload: Json | null;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          id?: string;
          line_user_id: string;
          payload?: Json | null;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: string;
          line_user_id?: string;
          payload?: Json | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "line_follow_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      line_link_audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_type: string;
          created_at: string;
          customer_id: string | null;
          error_message: string | null;
          id: string;
          line_user_id: string | null;
          meta: Json | null;
          result: string;
          session_id: string | null;
          source: string | null;
          tenant_id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_type: string;
          created_at?: string;
          customer_id?: string | null;
          error_message?: string | null;
          id?: string;
          line_user_id?: string | null;
          meta?: Json | null;
          result: string;
          session_id?: string | null;
          source?: string | null;
          tenant_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_type?: string;
          created_at?: string;
          customer_id?: string | null;
          error_message?: string | null;
          id?: string;
          line_user_id?: string | null;
          meta?: Json | null;
          result?: string;
          session_id?: string | null;
          source?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "line_link_audit_logs_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "line_link_audit_logs_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "line_link_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "line_link_audit_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      line_link_candidates: {
        Row: {
          created_at: string;
          id: string;
          last_followed_at: string | null;
          line_user_id: string;
          matched_customer_id: string | null;
          payload: Json | null;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_followed_at?: string | null;
          line_user_id: string;
          matched_customer_id?: string | null;
          payload?: Json | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_followed_at?: string | null;
          line_user_id?: string;
          matched_customer_id?: string | null;
          payload?: Json | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "line_link_candidates_matched_customer_id_fkey";
            columns: ["matched_customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "line_link_candidates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      line_link_sessions: {
        Row: {
          created_at: string;
          created_by: string | null;
          customer_id: string;
          expires_at: string;
          id: string;
          line_user_id: string | null;
          source: string | null;
          status: string;
          tenant_id: string;
          token_hash: string;
          used_at: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          customer_id: string;
          expires_at: string;
          id?: string;
          line_user_id?: string | null;
          source?: string | null;
          status?: string;
          tenant_id: string;
          token_hash: string;
          used_at?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          customer_id?: string;
          expires_at?: string;
          id?: string;
          line_user_id?: string | null;
          source?: string | null;
          status?: string;
          tenant_id?: string;
          token_hash?: string;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "line_link_sessions_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "line_link_sessions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      line_link_tokens: {
        Row: {
          created_at: string;
          customer_email: string;
          customer_id: string;
          expires_at: string;
          id: string;
          tenant_id: string;
          token: string;
          used_at: string | null;
        };
        Insert: {
          created_at?: string;
          customer_email: string;
          customer_id: string;
          expires_at: string;
          id?: string;
          tenant_id: string;
          token: string;
          used_at?: string | null;
        };
        Update: {
          created_at?: string;
          customer_email?: string;
          customer_id?: string;
          expires_at?: string;
          id?: string;
          tenant_id?: string;
          token?: string;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "line_link_tokens_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "line_link_tokens_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      line_pending_links: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          line_user_id: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          line_user_id: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          line_user_id?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "line_pending_links_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_images: {
        Row: {
          created_at: string;
          id: string;
          listing_id: string;
          sort_order: number;
          storage_path: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          listing_id: string;
          sort_order?: number;
          storage_path: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          listing_id?: string;
          sort_order?: number;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "inventory_listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_inquiries: {
        Row: {
          created_at: string;
          from_dealer_id: string;
          id: string;
          listing_id: string;
          status: string;
          to_dealer_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          from_dealer_id: string;
          id?: string;
          listing_id: string;
          status?: string;
          to_dealer_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          from_dealer_id?: string;
          id?: string;
          listing_id?: string;
          status?: string;
          to_dealer_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listing_inquiries_from_dealer_id_fkey";
            columns: ["from_dealer_id"];
            isOneToOne: false;
            referencedRelation: "dealers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "listing_inquiries_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "inventory_listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "listing_inquiries_to_dealer_id_fkey";
            columns: ["to_dealer_id"];
            isOneToOne: false;
            referencedRelation: "dealers";
            referencedColumns: ["id"];
          },
        ];
      };
      loaner_car_loans: {
        Row: {
          body_repair_job_id: string | null;
          created_at: string;
          customer_id: string | null;
          customer_name: string | null;
          id: string;
          lent_at: string;
          loaner_car_id: string;
          notes: string | null;
          reservation_id: string | null;
          return_due_at: string | null;
          returned_at: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          body_repair_job_id?: string | null;
          created_at?: string;
          customer_id?: string | null;
          customer_name?: string | null;
          id?: string;
          lent_at?: string;
          loaner_car_id: string;
          notes?: string | null;
          reservation_id?: string | null;
          return_due_at?: string | null;
          returned_at?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          body_repair_job_id?: string | null;
          created_at?: string;
          customer_id?: string | null;
          customer_name?: string | null;
          id?: string;
          lent_at?: string;
          loaner_car_id?: string;
          notes?: string | null;
          reservation_id?: string | null;
          return_due_at?: string | null;
          returned_at?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "loaner_car_loans_body_repair_job_id_fkey";
            columns: ["body_repair_job_id"];
            isOneToOne: false;
            referencedRelation: "body_repair_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loaner_car_loans_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loaner_car_loans_loaner_car_id_fkey";
            columns: ["loaner_car_id"];
            isOneToOne: false;
            referencedRelation: "loaner_cars";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loaner_car_loans_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loaner_car_loans_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      loaner_cars: {
        Row: {
          color: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          maker: string | null;
          model: string | null;
          name: string;
          notes: string | null;
          plate_display: string | null;
          tenant_id: string;
          updated_at: string;
          year: number | null;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          maker?: string | null;
          model?: string | null;
          name: string;
          notes?: string | null;
          plate_display?: string | null;
          tenant_id: string;
          updated_at?: string;
          year?: number | null;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          maker?: string | null;
          model?: string | null;
          name?: string;
          notes?: string | null;
          plate_display?: string | null;
          tenant_id?: string;
          updated_at?: string;
          year?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "loaner_cars_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      maintenance_pack_usages: {
        Row: {
          id: string;
          notes: string | null;
          pack_id: string;
          reservation_id: string | null;
          tenant_id: string;
          used_at: string;
        };
        Insert: {
          id?: string;
          notes?: string | null;
          pack_id: string;
          reservation_id?: string | null;
          tenant_id: string;
          used_at?: string;
        };
        Update: {
          id?: string;
          notes?: string | null;
          pack_id?: string;
          reservation_id?: string | null;
          tenant_id?: string;
          used_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "maintenance_pack_usages_pack_id_fkey";
            columns: ["pack_id"];
            isOneToOne: false;
            referencedRelation: "maintenance_packs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maintenance_pack_usages_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maintenance_pack_usages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      maintenance_packs: {
        Row: {
          created_at: string;
          customer_id: string | null;
          description: string | null;
          document_id: string | null;
          id: string;
          name: string;
          notes: string | null;
          price: number | null;
          sold_at: string | null;
          status: string;
          tenant_id: string;
          total_tickets: number;
          updated_at: string;
          used_tickets: number;
          valid_from: string | null;
          valid_until: string | null;
          vehicle_id: string | null;
        };
        Insert: {
          created_at?: string;
          customer_id?: string | null;
          description?: string | null;
          document_id?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          price?: number | null;
          sold_at?: string | null;
          status?: string;
          tenant_id: string;
          total_tickets?: number;
          updated_at?: string;
          used_tickets?: number;
          valid_from?: string | null;
          valid_until?: string | null;
          vehicle_id?: string | null;
        };
        Update: {
          created_at?: string;
          customer_id?: string | null;
          description?: string | null;
          document_id?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          price?: number | null;
          sold_at?: string | null;
          status?: string;
          tenant_id?: string;
          total_tickets?: number;
          updated_at?: string;
          used_tickets?: number;
          valid_from?: string | null;
          valid_until?: string | null;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "maintenance_packs_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maintenance_packs_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maintenance_packs_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maintenance_packs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maintenance_packs_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      manufacturer_certified_tenants: {
        Row: {
          certified_at: string;
          certified_by: string | null;
          created_at: string;
          id: string;
          manufacturer_id: string;
          notes: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          certified_at?: string;
          certified_by?: string | null;
          created_at?: string;
          id?: string;
          manufacturer_id: string;
          notes?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          certified_at?: string;
          certified_by?: string | null;
          created_at?: string;
          id?: string;
          manufacturer_id?: string;
          notes?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "manufacturer_certified_tenants_manufacturer_id_fkey";
            columns: ["manufacturer_id"];
            isOneToOne: false;
            referencedRelation: "manufacturers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manufacturer_certified_tenants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      manufacturer_memberships: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          invited_by: string | null;
          is_active: boolean;
          manufacturer_id: string;
          role: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          invited_by?: string | null;
          is_active?: boolean;
          manufacturer_id: string;
          role?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          invited_by?: string | null;
          is_active?: boolean;
          manufacturer_id?: string;
          role?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "manufacturer_memberships_manufacturer_id_fkey";
            columns: ["manufacturer_id"];
            isOneToOne: false;
            referencedRelation: "manufacturers";
            referencedColumns: ["id"];
          },
        ];
      };
      manufacturer_templates: {
        Row: {
          config_json: Json;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          layout_key: string;
          manufacturer_id: string;
          name: string;
          service_type: string | null;
          sort_order: number;
          thumbnail_path: string | null;
          updated_at: string;
        };
        Insert: {
          config_json?: Json;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          layout_key?: string;
          manufacturer_id: string;
          name: string;
          service_type?: string | null;
          sort_order?: number;
          thumbnail_path?: string | null;
          updated_at?: string;
        };
        Update: {
          config_json?: Json;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          layout_key?: string;
          manufacturer_id?: string;
          name?: string;
          service_type?: string | null;
          sort_order?: number;
          thumbnail_path?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "manufacturer_templates_manufacturer_id_fkey";
            columns: ["manufacturer_id"];
            isOneToOne: false;
            referencedRelation: "manufacturers";
            referencedColumns: ["id"];
          },
        ];
      };
      manufacturers: {
        Row: {
          contact_email: string | null;
          contact_phone: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          is_active: boolean;
          logo_asset_path: string | null;
          name: string;
          slug: string | null;
          updated_at: string;
          website_url: string | null;
        };
        Insert: {
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          logo_asset_path?: string | null;
          name: string;
          slug?: string | null;
          updated_at?: string;
          website_url?: string | null;
        };
        Update: {
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          logo_asset_path?: string | null;
          name?: string;
          slug?: string | null;
          updated_at?: string;
          website_url?: string | null;
        };
        Relationships: [];
      };
      market_deals: {
        Row: {
          agreed_price: number | null;
          buyer_company: string | null;
          buyer_email: string;
          buyer_name: string;
          buyer_tenant_id: string | null;
          created_at: string | null;
          estimate_document_id: string | null;
          id: string;
          inquiry_id: string | null;
          note: string | null;
          seller_tenant_id: string;
          status: string;
          trade_in_allowance: number | null;
          trade_in_vehicle_id: string | null;
          updated_at: string | null;
          vehicle_id: string;
        };
        Insert: {
          agreed_price?: number | null;
          buyer_company?: string | null;
          buyer_email: string;
          buyer_name: string;
          buyer_tenant_id?: string | null;
          created_at?: string | null;
          estimate_document_id?: string | null;
          id?: string;
          inquiry_id?: string | null;
          note?: string | null;
          seller_tenant_id: string;
          status?: string;
          trade_in_allowance?: number | null;
          trade_in_vehicle_id?: string | null;
          updated_at?: string | null;
          vehicle_id: string;
        };
        Update: {
          agreed_price?: number | null;
          buyer_company?: string | null;
          buyer_email?: string;
          buyer_name?: string;
          buyer_tenant_id?: string | null;
          created_at?: string | null;
          estimate_document_id?: string | null;
          id?: string;
          inquiry_id?: string | null;
          note?: string | null;
          seller_tenant_id?: string;
          status?: string;
          trade_in_allowance?: number | null;
          trade_in_vehicle_id?: string | null;
          updated_at?: string | null;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "market_deals_buyer_tenant_id_fkey";
            columns: ["buyer_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "market_deals_estimate_document_id_fkey";
            columns: ["estimate_document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "market_deals_estimate_document_id_fkey";
            columns: ["estimate_document_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "market_deals_inquiry_id_fkey";
            columns: ["inquiry_id"];
            isOneToOne: false;
            referencedRelation: "market_inquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "market_deals_seller_tenant_id_fkey";
            columns: ["seller_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "market_deals_trade_in_vehicle_id_fkey";
            columns: ["trade_in_vehicle_id"];
            isOneToOne: false;
            referencedRelation: "market_vehicles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "market_deals_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "market_vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      market_inquiries: {
        Row: {
          buyer_company: string | null;
          buyer_email: string;
          buyer_name: string;
          buyer_phone: string | null;
          buyer_tenant_id: string | null;
          created_at: string | null;
          id: string;
          message: string;
          seller_tenant_id: string;
          status: string;
          updated_at: string | null;
          vehicle_id: string;
        };
        Insert: {
          buyer_company?: string | null;
          buyer_email: string;
          buyer_name: string;
          buyer_phone?: string | null;
          buyer_tenant_id?: string | null;
          created_at?: string | null;
          id?: string;
          message: string;
          seller_tenant_id: string;
          status?: string;
          updated_at?: string | null;
          vehicle_id: string;
        };
        Update: {
          buyer_company?: string | null;
          buyer_email?: string;
          buyer_name?: string;
          buyer_phone?: string | null;
          buyer_tenant_id?: string | null;
          created_at?: string | null;
          id?: string;
          message?: string;
          seller_tenant_id?: string;
          status?: string;
          updated_at?: string | null;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "market_inquiries_buyer_tenant_id_fkey";
            columns: ["buyer_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "market_inquiries_seller_tenant_id_fkey";
            columns: ["seller_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "market_inquiries_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "market_vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      market_inquiry_messages: {
        Row: {
          created_at: string | null;
          id: string;
          inquiry_id: string;
          message: string;
          sender_tenant_id: string | null;
          sender_type: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          inquiry_id: string;
          message: string;
          sender_tenant_id?: string | null;
          sender_type: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          inquiry_id?: string;
          message?: string;
          sender_tenant_id?: string | null;
          sender_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "market_inquiry_messages_inquiry_id_fkey";
            columns: ["inquiry_id"];
            isOneToOne: false;
            referencedRelation: "market_inquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "market_inquiry_messages_sender_tenant_id_fkey";
            columns: ["sender_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      market_vehicle_images: {
        Row: {
          content_type: string | null;
          created_at: string | null;
          file_name: string | null;
          file_size: number | null;
          id: string;
          sort_order: number | null;
          storage_path: string;
          tenant_id: string;
          vehicle_id: string;
        };
        Insert: {
          content_type?: string | null;
          created_at?: string | null;
          file_name?: string | null;
          file_size?: number | null;
          id?: string;
          sort_order?: number | null;
          storage_path: string;
          tenant_id: string;
          vehicle_id: string;
        };
        Update: {
          content_type?: string | null;
          created_at?: string | null;
          file_name?: string | null;
          file_size?: number | null;
          id?: string;
          sort_order?: number | null;
          storage_path?: string;
          tenant_id?: string;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "market_vehicle_images_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "market_vehicle_images_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "market_vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      market_vehicles: {
        Row: {
          acquisition_date: string | null;
          asking_price: number | null;
          body_type: string | null;
          buyer_info: Json | null;
          chassis_number: string | null;
          color: string | null;
          color_code: string | null;
          condition_grade: string | null;
          condition_note: string | null;
          cost_price: number | null;
          created_at: string | null;
          description: string | null;
          displacement: number | null;
          door_count: number | null;
          drive_type: string | null;
          engine_type: string | null;
          features: string[] | null;
          fuel_type: string | null;
          grade: string | null;
          id: string;
          inspection_date: string | null;
          listed_at: string | null;
          maker: string;
          mileage: number | null;
          model: string;
          plate_number: string | null;
          repair_history: string | null;
          seating_capacity: number | null;
          sold_at: string | null;
          sold_price: number | null;
          status: string;
          store_id: string | null;
          supplier_name: string | null;
          tenant_id: string;
          transmission: string | null;
          updated_at: string | null;
          wholesale_price: number | null;
          year: number | null;
        };
        Insert: {
          acquisition_date?: string | null;
          asking_price?: number | null;
          body_type?: string | null;
          buyer_info?: Json | null;
          chassis_number?: string | null;
          color?: string | null;
          color_code?: string | null;
          condition_grade?: string | null;
          condition_note?: string | null;
          cost_price?: number | null;
          created_at?: string | null;
          description?: string | null;
          displacement?: number | null;
          door_count?: number | null;
          drive_type?: string | null;
          engine_type?: string | null;
          features?: string[] | null;
          fuel_type?: string | null;
          grade?: string | null;
          id?: string;
          inspection_date?: string | null;
          listed_at?: string | null;
          maker: string;
          mileage?: number | null;
          model: string;
          plate_number?: string | null;
          repair_history?: string | null;
          seating_capacity?: number | null;
          sold_at?: string | null;
          sold_price?: number | null;
          status?: string;
          store_id?: string | null;
          supplier_name?: string | null;
          tenant_id: string;
          transmission?: string | null;
          updated_at?: string | null;
          wholesale_price?: number | null;
          year?: number | null;
        };
        Update: {
          acquisition_date?: string | null;
          asking_price?: number | null;
          body_type?: string | null;
          buyer_info?: Json | null;
          chassis_number?: string | null;
          color?: string | null;
          color_code?: string | null;
          condition_grade?: string | null;
          condition_note?: string | null;
          cost_price?: number | null;
          created_at?: string | null;
          description?: string | null;
          displacement?: number | null;
          door_count?: number | null;
          drive_type?: string | null;
          engine_type?: string | null;
          features?: string[] | null;
          fuel_type?: string | null;
          grade?: string | null;
          id?: string;
          inspection_date?: string | null;
          listed_at?: string | null;
          maker?: string;
          mileage?: number | null;
          model?: string;
          plate_number?: string | null;
          repair_history?: string | null;
          seating_capacity?: number | null;
          sold_at?: string | null;
          sold_price?: number | null;
          status?: string;
          store_id?: string | null;
          supplier_name?: string | null;
          tenant_id?: string;
          transmission?: string | null;
          updated_at?: string | null;
          wholesale_price?: number | null;
          year?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "market_vehicles_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "market_vehicles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      marketing_leads: {
        Row: {
          assigned_to: string | null;
          company: string | null;
          consent_at: string | null;
          context: Json | null;
          created_at: string;
          downloaded_at: string | null;
          email: string;
          id: string;
          industry: string | null;
          locations: string | null;
          message: string | null;
          name: string | null;
          notes: string | null;
          phone: string | null;
          referrer: string | null;
          resource_key: string | null;
          role: string | null;
          source: string;
          status: string;
          timing: string | null;
          updated_at: string;
          user_agent: string | null;
          utm_campaign: string | null;
          utm_content: string | null;
          utm_medium: string | null;
          utm_source: string | null;
          utm_term: string | null;
        };
        Insert: {
          assigned_to?: string | null;
          company?: string | null;
          consent_at?: string | null;
          context?: Json | null;
          created_at?: string;
          downloaded_at?: string | null;
          email: string;
          id?: string;
          industry?: string | null;
          locations?: string | null;
          message?: string | null;
          name?: string | null;
          notes?: string | null;
          phone?: string | null;
          referrer?: string | null;
          resource_key?: string | null;
          role?: string | null;
          source: string;
          status?: string;
          timing?: string | null;
          updated_at?: string;
          user_agent?: string | null;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          utm_term?: string | null;
        };
        Update: {
          assigned_to?: string | null;
          company?: string | null;
          consent_at?: string | null;
          context?: Json | null;
          created_at?: string;
          downloaded_at?: string | null;
          email?: string;
          id?: string;
          industry?: string | null;
          locations?: string | null;
          message?: string | null;
          name?: string | null;
          notes?: string | null;
          phone?: string | null;
          referrer?: string | null;
          resource_key?: string | null;
          role?: string | null;
          source?: string;
          status?: string;
          timing?: string | null;
          updated_at?: string;
          user_agent?: string | null;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          utm_term?: string | null;
        };
        Relationships: [];
      };
      menu_items: {
        Row: {
          category_large: string | null;
          category_medium: string | null;
          category_small: string | null;
          cost_price: number;
          created_at: string | null;
          description: string | null;
          estimated_minutes: number | null;
          id: string;
          is_active: boolean;
          item_code: string | null;
          labor_hours: number | null;
          margin_rate: number | null;
          name: string;
          size_axis: string | null;
          size_prices: Json | null;
          sort_order: number | null;
          tax_category: number;
          tenant_id: string;
          unit: string | null;
          unit_price: number;
        };
        Insert: {
          category_large?: string | null;
          category_medium?: string | null;
          category_small?: string | null;
          cost_price?: number;
          created_at?: string | null;
          description?: string | null;
          estimated_minutes?: number | null;
          id?: string;
          is_active?: boolean;
          item_code?: string | null;
          labor_hours?: number | null;
          margin_rate?: number | null;
          name: string;
          size_axis?: string | null;
          size_prices?: Json | null;
          sort_order?: number | null;
          tax_category?: number;
          tenant_id: string;
          unit?: string | null;
          unit_price?: number;
        };
        Update: {
          category_large?: string | null;
          category_medium?: string | null;
          category_small?: string | null;
          cost_price?: number;
          created_at?: string | null;
          description?: string | null;
          estimated_minutes?: number | null;
          id?: string;
          is_active?: boolean;
          item_code?: string | null;
          labor_hours?: number | null;
          margin_rate?: number | null;
          name?: string;
          size_axis?: string | null;
          size_prices?: Json | null;
          sort_order?: number | null;
          tax_category?: number;
          tenant_id?: string;
          unit?: string | null;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "menu_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      nfc_tags: {
        Row: {
          attached_at: string | null;
          certificate_id: string | null;
          created_at: string;
          id: string;
          status: string;
          tag_code: string;
          tenant_id: string;
          uid: string | null;
          updated_at: string;
          vehicle_id: string | null;
          written_at: string | null;
        };
        Insert: {
          attached_at?: string | null;
          certificate_id?: string | null;
          created_at?: string;
          id?: string;
          status?: string;
          tag_code: string;
          tenant_id: string;
          uid?: string | null;
          updated_at?: string;
          vehicle_id?: string | null;
          written_at?: string | null;
        };
        Update: {
          attached_at?: string | null;
          certificate_id?: string | null;
          created_at?: string;
          id?: string;
          status?: string;
          tag_code?: string;
          tenant_id?: string;
          uid?: string | null;
          updated_at?: string;
          vehicle_id?: string | null;
          written_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "nfc_tags_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "nfc_tags_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "nfc_tags_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_logs: {
        Row: {
          channel: string;
          id: string;
          recipient_email: string | null;
          recipient_line_user_id: string | null;
          sent_at: string | null;
          status: string;
          target_id: string;
          target_type: string;
          tenant_id: string;
          type: string;
        };
        Insert: {
          channel?: string;
          id?: string;
          recipient_email?: string | null;
          recipient_line_user_id?: string | null;
          sent_at?: string | null;
          status?: string;
          target_id: string;
          target_type: string;
          tenant_id: string;
          type: string;
        };
        Update: {
          channel?: string;
          id?: string;
          recipient_email?: string | null;
          recipient_line_user_id?: string | null;
          sent_at?: string | null;
          status?: string;
          target_id?: string;
          target_type?: string;
          tenant_id?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          job_order_id: string | null;
          link_path: string | null;
          notification_type: string;
          priority: string;
          read_at: string | null;
          tenant_id: string;
          title: string;
          user_id: string | null;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          job_order_id?: string | null;
          link_path?: string | null;
          notification_type: string;
          priority?: string;
          read_at?: string | null;
          tenant_id: string;
          title: string;
          user_id?: string | null;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          job_order_id?: string | null;
          link_path?: string | null;
          notification_type?: string;
          priority?: string;
          read_at?: string | null;
          tenant_id?: string;
          title?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_job_order_id_fkey";
            columns: ["job_order_id"];
            isOneToOne: false;
            referencedRelation: "job_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      operator_credentials: {
        Row: {
          aaguid: string | null;
          backed_up: boolean;
          counter: number;
          created_at: string;
          credential_id: string;
          device_label: string | null;
          device_type: string | null;
          id: string;
          is_active: boolean;
          last_used_at: string | null;
          public_key: string;
          tenant_id: string;
          transports: string[] | null;
          user_id: string;
        };
        Insert: {
          aaguid?: string | null;
          backed_up?: boolean;
          counter?: number;
          created_at?: string;
          credential_id: string;
          device_label?: string | null;
          device_type?: string | null;
          id?: string;
          is_active?: boolean;
          last_used_at?: string | null;
          public_key: string;
          tenant_id: string;
          transports?: string[] | null;
          user_id: string;
        };
        Update: {
          aaguid?: string | null;
          backed_up?: boolean;
          counter?: number;
          created_at?: string;
          credential_id?: string;
          device_label?: string | null;
          device_type?: string | null;
          id?: string;
          is_active?: boolean;
          last_used_at?: string | null;
          public_key?: string;
          tenant_id?: string;
          transports?: string[] | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "operator_credentials_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      operator_users: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string;
          id?: string;
          role?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      order_audit_log: {
        Row: {
          action: string;
          actor_tenant_id: string | null;
          actor_user_id: string | null;
          created_at: string;
          id: string;
          job_order_id: string;
          new_value: Json | null;
          old_value: Json | null;
        };
        Insert: {
          action: string;
          actor_tenant_id?: string | null;
          actor_user_id?: string | null;
          created_at?: string;
          id?: string;
          job_order_id: string;
          new_value?: Json | null;
          old_value?: Json | null;
        };
        Update: {
          action?: string;
          actor_tenant_id?: string | null;
          actor_user_id?: string | null;
          created_at?: string;
          id?: string;
          job_order_id?: string;
          new_value?: Json | null;
          old_value?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_audit_log_actor_tenant_id_fkey";
            columns: ["actor_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_audit_log_job_order_id_fkey";
            columns: ["job_order_id"];
            isOneToOne: false;
            referencedRelation: "job_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      order_reviews: {
        Row: {
          comment: string | null;
          id: string;
          job_order_id: string;
          published_at: string | null;
          rating: number;
          reviewed_tenant_id: string;
          reviewer_tenant_id: string;
          submitted_at: string;
        };
        Insert: {
          comment?: string | null;
          id?: string;
          job_order_id: string;
          published_at?: string | null;
          rating: number;
          reviewed_tenant_id: string;
          reviewer_tenant_id: string;
          submitted_at?: string;
        };
        Update: {
          comment?: string | null;
          id?: string;
          job_order_id?: string;
          published_at?: string | null;
          rating?: number;
          reviewed_tenant_id?: string;
          reviewer_tenant_id?: string;
          submitted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_reviews_job_order_id_fkey";
            columns: ["job_order_id"];
            isOneToOne: false;
            referencedRelation: "job_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_reviews_reviewed_tenant_id_fkey";
            columns: ["reviewed_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_reviews_reviewer_tenant_id_fkey";
            columns: ["reviewer_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_members: {
        Row: {
          id: string;
          joined_at: string;
          organization_id: string;
          role: string;
          tenant_id: string;
        };
        Insert: {
          id?: string;
          joined_at?: string;
          organization_id: string;
          role?: string;
          tenant_id: string;
        };
        Update: {
          id?: string;
          joined_at?: string;
          organization_id?: string;
          role?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_users: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          role: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          role?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          role?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_users_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      outbox_events: {
        Row: {
          aggregate_id: string | null;
          attempts: number;
          created_at: string;
          delivered_at: string | null;
          id: string;
          last_error: string | null;
          next_attempt_at: string;
          payload: Json;
          status: string;
          tenant_id: string;
          topic: string;
          updated_at: string;
        };
        Insert: {
          aggregate_id?: string | null;
          attempts?: number;
          created_at?: string;
          delivered_at?: string | null;
          id?: string;
          last_error?: string | null;
          next_attempt_at?: string;
          payload: Json;
          status?: string;
          tenant_id: string;
          topic: string;
          updated_at?: string;
        };
        Update: {
          aggregate_id?: string | null;
          attempts?: number;
          created_at?: string;
          delivered_at?: string | null;
          id?: string;
          last_error?: string | null;
          next_attempt_at?: string;
          payload?: Json;
          status?: string;
          tenant_id?: string;
          topic?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outbox_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      part_confirmation_signatures: {
        Row: {
          assurance: string | null;
          channel: string | null;
          contact_provenance: string | null;
          created_at: string;
          document_hash: string | null;
          document_hash_alg: string;
          expires_at: string | null;
          id: string;
          installation_id: string;
          key_version: string | null;
          otp_attempts: number;
          otp_code_hash: string | null;
          otp_expires_at: string | null;
          otp_verified_at: string | null;
          public_key_fingerprint: string | null;
          signature: string | null;
          signed_at: string | null;
          signer_ip: string | null;
          signer_phone_full_hash: string | null;
          signer_phone_last4_hash: string | null;
          signer_user_agent: string | null;
          signing_payload: string | null;
          status: string;
          tenant_id: string;
          token: string | null;
          tsa_authority: string | null;
          tsa_timestamp_at: string | null;
          tsa_token: string | null;
          updated_at: string;
          witness_staff_id: string | null;
        };
        Insert: {
          assurance?: string | null;
          channel?: string | null;
          contact_provenance?: string | null;
          created_at?: string;
          document_hash?: string | null;
          document_hash_alg?: string;
          expires_at?: string | null;
          id?: string;
          installation_id: string;
          key_version?: string | null;
          otp_attempts?: number;
          otp_code_hash?: string | null;
          otp_expires_at?: string | null;
          otp_verified_at?: string | null;
          public_key_fingerprint?: string | null;
          signature?: string | null;
          signed_at?: string | null;
          signer_ip?: string | null;
          signer_phone_full_hash?: string | null;
          signer_phone_last4_hash?: string | null;
          signer_user_agent?: string | null;
          signing_payload?: string | null;
          status?: string;
          tenant_id: string;
          token?: string | null;
          tsa_authority?: string | null;
          tsa_timestamp_at?: string | null;
          tsa_token?: string | null;
          updated_at?: string;
          witness_staff_id?: string | null;
        };
        Update: {
          assurance?: string | null;
          channel?: string | null;
          contact_provenance?: string | null;
          created_at?: string;
          document_hash?: string | null;
          document_hash_alg?: string;
          expires_at?: string | null;
          id?: string;
          installation_id?: string;
          key_version?: string | null;
          otp_attempts?: number;
          otp_code_hash?: string | null;
          otp_expires_at?: string | null;
          otp_verified_at?: string | null;
          public_key_fingerprint?: string | null;
          signature?: string | null;
          signed_at?: string | null;
          signer_ip?: string | null;
          signer_phone_full_hash?: string | null;
          signer_phone_last4_hash?: string | null;
          signer_user_agent?: string | null;
          signing_payload?: string | null;
          status?: string;
          tenant_id?: string;
          token?: string | null;
          tsa_authority?: string | null;
          tsa_timestamp_at?: string | null;
          tsa_token?: string | null;
          updated_at?: string;
          witness_staff_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "part_confirmation_signatures_installation_id_fkey";
            columns: ["installation_id"];
            isOneToOne: false;
            referencedRelation: "part_installations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "part_confirmation_signatures_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      part_installation_anchors: {
        Row: {
          anchored_at: string;
          content_hash: string;
          id: string;
          installation_id: string;
          polygon_network: string | null;
          polygon_tx_hash: string | null;
          tenant_id: string;
        };
        Insert: {
          anchored_at?: string;
          content_hash: string;
          id?: string;
          installation_id: string;
          polygon_network?: string | null;
          polygon_tx_hash?: string | null;
          tenant_id: string;
        };
        Update: {
          anchored_at?: string;
          content_hash?: string;
          id?: string;
          installation_id?: string;
          polygon_network?: string | null;
          polygon_tx_hash?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "part_installation_anchors_installation_id_fkey";
            columns: ["installation_id"];
            isOneToOne: true;
            referencedRelation: "part_installations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "part_installation_anchors_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      part_installation_evidence: {
        Row: {
          authenticity_grade: string;
          c2pa_verified: boolean;
          capture_nonce: string | null;
          content_type: string | null;
          created_at: string;
          device_attestation_verified: boolean;
          exif_captured_at: string | null;
          id: string;
          installation_id: string;
          kind: string;
          ocr_extracted: Json | null;
          perceptual_hash: string | null;
          sha256: string | null;
          storage_path: string | null;
          tenant_id: string;
          tsa_authority: string | null;
          tsa_timestamp_at: string | null;
        };
        Insert: {
          authenticity_grade?: string;
          c2pa_verified?: boolean;
          capture_nonce?: string | null;
          content_type?: string | null;
          created_at?: string;
          device_attestation_verified?: boolean;
          exif_captured_at?: string | null;
          id?: string;
          installation_id: string;
          kind: string;
          ocr_extracted?: Json | null;
          perceptual_hash?: string | null;
          sha256?: string | null;
          storage_path?: string | null;
          tenant_id: string;
          tsa_authority?: string | null;
          tsa_timestamp_at?: string | null;
        };
        Update: {
          authenticity_grade?: string;
          c2pa_verified?: boolean;
          capture_nonce?: string | null;
          content_type?: string | null;
          created_at?: string;
          device_attestation_verified?: boolean;
          exif_captured_at?: string | null;
          id?: string;
          installation_id?: string;
          kind?: string;
          ocr_extracted?: Json | null;
          perceptual_hash?: string | null;
          sha256?: string | null;
          storage_path?: string | null;
          tenant_id?: string;
          tsa_authority?: string | null;
          tsa_timestamp_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "part_installation_evidence_installation_id_fkey";
            columns: ["installation_id"];
            isOneToOne: false;
            referencedRelation: "part_installations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "part_installation_evidence_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      part_installations: {
        Row: {
          amount_jpy: number | null;
          certificate_id: string | null;
          confirmation_signature_id: string | null;
          content_hash: string | null;
          created_at: string;
          customer_id: string | null;
          customer_verified_at: string | null;
          customer_verified_via: string | null;
          gtin: string | null;
          id: string;
          installed_at: string;
          installed_by: string | null;
          inventory_item_id: string | null;
          job_order_id: string | null;
          lot_code: string | null;
          part_kind: string;
          part_name: string;
          polygon_network: string | null;
          polygon_tx_hash: string | null;
          quantity: number;
          required_assurance: string;
          reservation_id: string | null;
          serial_no: string | null;
          status: string;
          tenant_id: string;
          unit: string;
          updated_at: string;
          vehicle_id: string | null;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          amount_jpy?: number | null;
          certificate_id?: string | null;
          confirmation_signature_id?: string | null;
          content_hash?: string | null;
          created_at?: string;
          customer_id?: string | null;
          customer_verified_at?: string | null;
          customer_verified_via?: string | null;
          gtin?: string | null;
          id?: string;
          installed_at?: string;
          installed_by?: string | null;
          inventory_item_id?: string | null;
          job_order_id?: string | null;
          lot_code?: string | null;
          part_kind?: string;
          part_name: string;
          polygon_network?: string | null;
          polygon_tx_hash?: string | null;
          quantity?: number;
          required_assurance?: string;
          reservation_id?: string | null;
          serial_no?: string | null;
          status?: string;
          tenant_id: string;
          unit?: string;
          updated_at?: string;
          vehicle_id?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          amount_jpy?: number | null;
          certificate_id?: string | null;
          confirmation_signature_id?: string | null;
          content_hash?: string | null;
          created_at?: string;
          customer_id?: string | null;
          customer_verified_at?: string | null;
          customer_verified_via?: string | null;
          gtin?: string | null;
          id?: string;
          installed_at?: string;
          installed_by?: string | null;
          inventory_item_id?: string | null;
          job_order_id?: string | null;
          lot_code?: string | null;
          part_kind?: string;
          part_name?: string;
          polygon_network?: string | null;
          polygon_tx_hash?: string | null;
          quantity?: number;
          required_assurance?: string;
          reservation_id?: string | null;
          serial_no?: string | null;
          status?: string;
          tenant_id?: string;
          unit?: string;
          updated_at?: string;
          vehicle_id?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "part_installations_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "part_installations_confirmation_signature_fk";
            columns: ["confirmation_signature_id"];
            isOneToOne: false;
            referencedRelation: "part_confirmation_signatures";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "part_installations_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "part_installations_inventory_item_id_fkey";
            columns: ["inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "part_installations_job_order_id_fkey";
            columns: ["job_order_id"];
            isOneToOne: false;
            referencedRelation: "job_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "part_installations_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "part_installations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "part_installations_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      part_integrity_findings: {
        Row: {
          created_at: string;
          detail: Json;
          id: string;
          installation_id: string | null;
          rule: string;
          severity: string;
          status: string;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          detail?: Json;
          id?: string;
          installation_id?: string | null;
          rule: string;
          severity?: string;
          status?: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          detail?: Json;
          id?: string;
          installation_id?: string | null;
          rule?: string;
          severity?: string;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "part_integrity_findings_installation_id_fkey";
            columns: ["installation_id"];
            isOneToOne: false;
            referencedRelation: "part_installations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "part_integrity_findings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      part_serial_registry: {
        Row: {
          consumed_at: string;
          consumed_by_tenant_id: string | null;
          id: string;
          installation_id: string | null;
          serial_fingerprint: string;
        };
        Insert: {
          consumed_at?: string;
          consumed_by_tenant_id?: string | null;
          id?: string;
          installation_id?: string | null;
          serial_fingerprint: string;
        };
        Update: {
          consumed_at?: string;
          consumed_by_tenant_id?: string | null;
          id?: string;
          installation_id?: string | null;
          serial_fingerprint?: string;
        };
        Relationships: [
          {
            foreignKeyName: "part_serial_registry_consumed_by_tenant_id_fkey";
            columns: ["consumed_by_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "part_serial_registry_installation_id_fkey";
            columns: ["installation_id"];
            isOneToOne: false;
            referencedRelation: "part_installations";
            referencedColumns: ["id"];
          },
        ];
      };
      part_vehicle_meta_anchors: {
        Row: {
          anchored_at: string | null;
          content_hash_count: number;
          id: string;
          meta_hash: string;
          polygon_network: string | null;
          polygon_tx_hash: string | null;
          tenant_id: string;
          updated_at: string;
          vehicle_id: string;
        };
        Insert: {
          anchored_at?: string | null;
          content_hash_count?: number;
          id?: string;
          meta_hash: string;
          polygon_network?: string | null;
          polygon_tx_hash?: string | null;
          tenant_id: string;
          updated_at?: string;
          vehicle_id: string;
        };
        Update: {
          anchored_at?: string | null;
          content_hash_count?: number;
          id?: string;
          meta_hash?: string;
          polygon_network?: string | null;
          polygon_tx_hash?: string | null;
          tenant_id?: string;
          updated_at?: string;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "part_vehicle_meta_anchors_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "part_vehicle_meta_anchors_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: true;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      partner_scores: {
        Row: {
          avg_rating: number | null;
          cancelled_orders: number;
          completed_orders: number;
          on_time_orders: number;
          rating_count: number;
          tenant_id: string;
          total_orders: number;
          updated_at: string;
        };
        Insert: {
          avg_rating?: number | null;
          cancelled_orders?: number;
          completed_orders?: number;
          on_time_orders?: number;
          rating_count?: number;
          tenant_id: string;
          total_orders?: number;
          updated_at?: string;
        };
        Update: {
          avg_rating?: number | null;
          cancelled_orders?: number;
          completed_orders?: number;
          on_time_orders?: number;
          rating_count?: number;
          tenant_id?: string;
          total_orders?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "partner_scores_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      parts_orders: {
        Row: {
          created_at: string;
          expected_at: string | null;
          id: string;
          notes: string | null;
          ordered_at: string;
          part_name: string;
          part_number: string | null;
          quantity: number;
          received_at: string | null;
          reservation_id: string | null;
          status: string;
          supplier: string | null;
          tenant_id: string;
          unit_price: number | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          expected_at?: string | null;
          id?: string;
          notes?: string | null;
          ordered_at?: string;
          part_name: string;
          part_number?: string | null;
          quantity?: number;
          received_at?: string | null;
          reservation_id?: string | null;
          status?: string;
          supplier?: string | null;
          tenant_id: string;
          unit_price?: number | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          expected_at?: string | null;
          id?: string;
          notes?: string | null;
          ordered_at?: string;
          part_name?: string;
          part_number?: string | null;
          quantity?: number;
          received_at?: string | null;
          reservation_id?: string | null;
          status?: string;
          supplier?: string | null;
          tenant_id?: string;
          unit_price?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "parts_orders_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parts_orders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      passport_api_billing_periods: {
        Row: {
          call_count: number;
          consumer_id: string;
          created_at: string;
          id: string;
          last_attempt_at: string;
          last_error: string | null;
          period_end: string;
          period_start: string;
          reported_to_stripe_at: string | null;
          stripe_usage_record_id: string | null;
          updated_at: string;
        };
        Insert: {
          call_count?: number;
          consumer_id: string;
          created_at?: string;
          id?: string;
          last_attempt_at?: string;
          last_error?: string | null;
          period_end: string;
          period_start: string;
          reported_to_stripe_at?: string | null;
          stripe_usage_record_id?: string | null;
          updated_at?: string;
        };
        Update: {
          call_count?: number;
          consumer_id?: string;
          created_at?: string;
          id?: string;
          last_attempt_at?: string;
          last_error?: string | null;
          period_end?: string;
          period_start?: string;
          reported_to_stripe_at?: string | null;
          stripe_usage_record_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "passport_api_billing_periods_consumer_id_fkey";
            columns: ["consumer_id"];
            isOneToOne: false;
            referencedRelation: "passport_api_consumers";
            referencedColumns: ["id"];
          },
        ];
      };
      passport_api_call_logs: {
        Row: {
          api_key_id: string | null;
          called_at: string;
          consumer_id: string | null;
          endpoint: string;
          id: number;
          ip_hash: string | null;
          response_status: number;
          response_time_ms: number | null;
          user_agent: string | null;
          vin_queried_normalized: string | null;
        };
        Insert: {
          api_key_id?: string | null;
          called_at?: string;
          consumer_id?: string | null;
          endpoint: string;
          id?: number;
          ip_hash?: string | null;
          response_status: number;
          response_time_ms?: number | null;
          user_agent?: string | null;
          vin_queried_normalized?: string | null;
        };
        Update: {
          api_key_id?: string | null;
          called_at?: string;
          consumer_id?: string | null;
          endpoint?: string;
          id?: number;
          ip_hash?: string | null;
          response_status?: number;
          response_time_ms?: number | null;
          user_agent?: string | null;
          vin_queried_normalized?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "passport_api_call_logs_api_key_id_fkey";
            columns: ["api_key_id"];
            isOneToOne: false;
            referencedRelation: "passport_api_keys";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "passport_api_call_logs_consumer_id_fkey";
            columns: ["consumer_id"];
            isOneToOne: false;
            referencedRelation: "passport_api_consumers";
            referencedColumns: ["id"];
          },
        ];
      };
      passport_api_consumers: {
        Row: {
          contact_email: string;
          created_at: string;
          id: string;
          monthly_quota: number;
          name: string;
          rate_limit_per_minute: number;
          status: string;
          stripe_customer_id: string | null;
          stripe_subscription_item_id: string | null;
          updated_at: string;
        };
        Insert: {
          contact_email: string;
          created_at?: string;
          id?: string;
          monthly_quota?: number;
          name: string;
          rate_limit_per_minute?: number;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_item_id?: string | null;
          updated_at?: string;
        };
        Update: {
          contact_email?: string;
          created_at?: string;
          id?: string;
          monthly_quota?: number;
          name?: string;
          rate_limit_per_minute?: number;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_item_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      passport_api_keys: {
        Row: {
          consumer_id: string;
          created_at: string;
          expires_at: string | null;
          id: string;
          key_hash: string;
          key_prefix: string;
          last_used_at: string | null;
          name: string;
          revoked_at: string | null;
          scopes: string[];
          updated_at: string;
        };
        Insert: {
          consumer_id: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          key_hash: string;
          key_prefix: string;
          last_used_at?: string | null;
          name: string;
          revoked_at?: string | null;
          scopes?: string[];
          updated_at?: string;
        };
        Update: {
          consumer_id?: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          key_hash?: string;
          key_prefix?: string;
          last_used_at?: string | null;
          name?: string;
          revoked_at?: string | null;
          scopes?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "passport_api_keys_consumer_id_fkey";
            columns: ["consumer_id"];
            isOneToOne: false;
            referencedRelation: "passport_api_consumers";
            referencedColumns: ["id"];
          },
        ];
      };
      passport_ownership_transfers: {
        Row: {
          created_at: string;
          expires_at: string;
          from_owner_email: string | null;
          from_owner_name: string | null;
          id: string;
          initiated_at: string;
          initiated_by_user_id: string | null;
          initiating_tenant_id: string;
          initiating_vehicle_id: string | null;
          message: string | null;
          responded_at: string | null;
          status: string;
          to_owner_email: string;
          to_owner_name: string | null;
          transfer_token_hash: string;
          updated_at: string;
          vin_code_normalized: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          from_owner_email?: string | null;
          from_owner_name?: string | null;
          id?: string;
          initiated_at?: string;
          initiated_by_user_id?: string | null;
          initiating_tenant_id: string;
          initiating_vehicle_id?: string | null;
          message?: string | null;
          responded_at?: string | null;
          status?: string;
          to_owner_email: string;
          to_owner_name?: string | null;
          transfer_token_hash: string;
          updated_at?: string;
          vin_code_normalized: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          from_owner_email?: string | null;
          from_owner_name?: string | null;
          id?: string;
          initiated_at?: string;
          initiated_by_user_id?: string | null;
          initiating_tenant_id?: string;
          initiating_vehicle_id?: string | null;
          message?: string | null;
          responded_at?: string | null;
          status?: string;
          to_owner_email?: string;
          to_owner_name?: string | null;
          transfer_token_hash?: string;
          updated_at?: string;
          vin_code_normalized?: string;
        };
        Relationships: [
          {
            foreignKeyName: "passport_ownership_transfers_initiating_tenant_id_fkey";
            columns: ["initiating_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "passport_ownership_transfers_initiating_vehicle_id_fkey";
            columns: ["initiating_vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      passport_referral_leads: {
        Row: {
          api_key_id: string | null;
          attributed_tenant_ids: string[];
          claimed_at: string | null;
          consumer_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          lead_token: string;
          partner_reference: string | null;
          queried_at: string;
          referral_fee_jpy: number | null;
          sale_amount_jpy: number | null;
          status: string;
          updated_at: string;
          vin_code_normalized: string;
        };
        Insert: {
          api_key_id?: string | null;
          attributed_tenant_ids?: string[];
          claimed_at?: string | null;
          consumer_id: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          lead_token: string;
          partner_reference?: string | null;
          queried_at?: string;
          referral_fee_jpy?: number | null;
          sale_amount_jpy?: number | null;
          status?: string;
          updated_at?: string;
          vin_code_normalized: string;
        };
        Update: {
          api_key_id?: string | null;
          attributed_tenant_ids?: string[];
          claimed_at?: string | null;
          consumer_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          lead_token?: string;
          partner_reference?: string | null;
          queried_at?: string;
          referral_fee_jpy?: number | null;
          sale_amount_jpy?: number | null;
          status?: string;
          updated_at?: string;
          vin_code_normalized?: string;
        };
        Relationships: [
          {
            foreignKeyName: "passport_referral_leads_api_key_id_fkey";
            columns: ["api_key_id"];
            isOneToOne: false;
            referencedRelation: "passport_api_keys";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "passport_referral_leads_consumer_id_fkey";
            columns: ["consumer_id"];
            isOneToOne: false;
            referencedRelation: "passport_api_consumers";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_entries: {
        Row: {
          amount: number;
          created_at: string;
          customer_id: string | null;
          document_id: string;
          id: string;
          notes: string | null;
          payment_date: string;
          payment_method: string;
          recorded_by: string | null;
          reference_no: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          customer_id?: string | null;
          document_id: string;
          id?: string;
          notes?: string | null;
          payment_date?: string;
          payment_method?: string;
          recorded_by?: string | null;
          reference_no?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          customer_id?: string | null;
          document_id?: string;
          id?: string;
          notes?: string | null;
          payment_date?: string;
          payment_method?: string;
          recorded_by?: string | null;
          reference_no?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_entries_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_entries_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_entries_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_entries_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          change_amount: number | null;
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          document_id: string | null;
          id: string;
          idempotency_key: string | null;
          job_order_id: string | null;
          note: string | null;
          paid_at: string;
          payment_method: string;
          received_amount: number | null;
          refund_amount: number | null;
          refund_reason: string | null;
          register_session_id: string | null;
          reservation_id: string | null;
          status: string;
          store_id: string | null;
          stripe_payment_intent_id: string | null;
          stripe_transfer_id: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          change_amount?: number | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          document_id?: string | null;
          id?: string;
          idempotency_key?: string | null;
          job_order_id?: string | null;
          note?: string | null;
          paid_at?: string;
          payment_method: string;
          received_amount?: number | null;
          refund_amount?: number | null;
          refund_reason?: string | null;
          register_session_id?: string | null;
          reservation_id?: string | null;
          status?: string;
          store_id?: string | null;
          stripe_payment_intent_id?: string | null;
          stripe_transfer_id?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          change_amount?: number | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          document_id?: string | null;
          id?: string;
          idempotency_key?: string | null;
          job_order_id?: string | null;
          note?: string | null;
          paid_at?: string;
          payment_method?: string;
          received_amount?: number | null;
          refund_amount?: number | null;
          refund_reason?: string | null;
          register_session_id?: string | null;
          reservation_id?: string | null;
          status?: string;
          store_id?: string | null;
          stripe_payment_intent_id?: string | null;
          stripe_transfer_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fk_payments_register_session";
            columns: ["register_session_id"];
            isOneToOne: false;
            referencedRelation: "register_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_job_order_id_fkey";
            columns: ["job_order_id"];
            isOneToOne: false;
            referencedRelation: "job_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      photo_capture_nonces: {
        Row: {
          certificate_id: string;
          consumed_at: string | null;
          created_at: string;
          device_key_hash: string | null;
          expires_at: string;
          nonce: string;
          status: string;
          tenant_id: string;
        };
        Insert: {
          certificate_id: string;
          consumed_at?: string | null;
          created_at?: string;
          device_key_hash?: string | null;
          expires_at?: string;
          nonce: string;
          status?: string;
          tenant_id: string;
        };
        Update: {
          certificate_id?: string;
          consumed_at?: string | null;
          created_at?: string;
          device_key_hash?: string | null;
          expires_at?: string;
          nonce?: string;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "photo_capture_nonces_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "photo_capture_nonces_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      pii_disclosure_consents: {
        Row: {
          certificate_id: string;
          created_at: string;
          id: string;
          insurer_id: string;
          insurer_reason: string | null;
          insurer_requested_at: string | null;
          insurer_requested_by: string | null;
          is_active: boolean;
          revoked_at: string | null;
          revoked_by: string | null;
          tenant_consented_at: string | null;
          tenant_consented_by: string | null;
          tenant_reason: string | null;
          updated_at: string;
        };
        Insert: {
          certificate_id: string;
          created_at?: string;
          id?: string;
          insurer_id: string;
          insurer_reason?: string | null;
          insurer_requested_at?: string | null;
          insurer_requested_by?: string | null;
          is_active?: boolean;
          revoked_at?: string | null;
          revoked_by?: string | null;
          tenant_consented_at?: string | null;
          tenant_consented_by?: string | null;
          tenant_reason?: string | null;
          updated_at?: string;
        };
        Update: {
          certificate_id?: string;
          created_at?: string;
          id?: string;
          insurer_id?: string;
          insurer_reason?: string | null;
          insurer_requested_at?: string | null;
          insurer_requested_by?: string | null;
          is_active?: boolean;
          revoked_at?: string | null;
          revoked_by?: string | null;
          tenant_consented_at?: string | null;
          tenant_consented_by?: string | null;
          tenant_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pii_disclosure_consents_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pii_disclosure_consents_insurer_id_fkey";
            columns: ["insurer_id"];
            isOneToOne: false;
            referencedRelation: "insurers";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_config: {
        Row: {
          key: string;
          value: string;
        };
        Insert: {
          key: string;
          value: string;
        };
        Update: {
          key?: string;
          value?: string;
        };
        Relationships: [];
      };
      platform_templates: {
        Row: {
          base_config: Json;
          category: string;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          layout_key: string;
          name: string;
          sort_order: number;
          thumbnail_path: string | null;
          updated_at: string;
        };
        Insert: {
          base_config?: Json;
          category?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          layout_key?: string;
          name: string;
          sort_order?: number;
          thumbnail_path?: string | null;
          updated_at?: string;
        };
        Update: {
          base_config?: Json;
          category?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          layout_key?: string;
          name?: string;
          sort_order?: number;
          thumbnail_path?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      polygon_backfill_jobs: {
        Row: {
          created_at: string;
          error_message: string | null;
          id: string;
          processed_count: number;
          status: string;
          tenant_id: string;
          total_count: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          error_message?: string | null;
          id?: string;
          processed_count?: number;
          status?: string;
          tenant_id: string;
          total_count?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          error_message?: string | null;
          id?: string;
          processed_count?: number;
          status?: string;
          tenant_id?: string;
          total_count?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "polygon_backfill_jobs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      pos_receipt_counters: {
        Row: {
          last_number: number;
          tenant_id: string;
          updated_at: string;
          year_month: string;
        };
        Insert: {
          last_number?: number;
          tenant_id: string;
          updated_at?: string;
          year_month: string;
        };
        Update: {
          last_number?: number;
          tenant_id?: string;
          updated_at?: string;
          year_month?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pos_receipt_counters_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_order_items: {
        Row: {
          accepted_quantity: number | null;
          amount: number;
          backorder_quantity: number | null;
          created_at: string;
          id: string;
          item_id: string | null;
          name: string;
          po_id: string;
          quantity: number;
          received: boolean;
          sku: string | null;
          tenant_id: string;
          unit_cost: number | null;
        };
        Insert: {
          accepted_quantity?: number | null;
          amount?: number;
          backorder_quantity?: number | null;
          created_at?: string;
          id?: string;
          item_id?: string | null;
          name: string;
          po_id: string;
          quantity: number;
          received?: boolean;
          sku?: string | null;
          tenant_id: string;
          unit_cost?: number | null;
        };
        Update: {
          accepted_quantity?: number | null;
          amount?: number;
          backorder_quantity?: number | null;
          created_at?: string;
          id?: string;
          item_id?: string | null;
          name?: string;
          po_id?: string;
          quantity?: number;
          received?: boolean;
          sku?: string | null;
          tenant_id?: string;
          unit_cost?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_order_items_po_id_fkey";
            columns: ["po_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_order_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_orders: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          created_by: string | null;
          decline_reason: string | null;
          external_order_id: string | null;
          id: string;
          note: string | null;
          partner_responded_at: string | null;
          partner_response: string | null;
          partner_response_note: string | null;
          partner_ship_eta: string | null;
          partner_tracking_no: string | null;
          po_number: string | null;
          received_at: string | null;
          sent_at: string | null;
          source: string;
          status: string;
          subtotal: number;
          supplier_id: string | null;
          supply_partner_id: string | null;
          tenant_id: string;
          transport: string | null;
          transport_error: string | null;
          transport_status: string | null;
          updated_at: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          decline_reason?: string | null;
          external_order_id?: string | null;
          id?: string;
          note?: string | null;
          partner_responded_at?: string | null;
          partner_response?: string | null;
          partner_response_note?: string | null;
          partner_ship_eta?: string | null;
          partner_tracking_no?: string | null;
          po_number?: string | null;
          received_at?: string | null;
          sent_at?: string | null;
          source?: string;
          status?: string;
          subtotal?: number;
          supplier_id?: string | null;
          supply_partner_id?: string | null;
          tenant_id: string;
          transport?: string | null;
          transport_error?: string | null;
          transport_status?: string | null;
          updated_at?: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          decline_reason?: string | null;
          external_order_id?: string | null;
          id?: string;
          note?: string | null;
          partner_responded_at?: string | null;
          partner_response?: string | null;
          partner_response_note?: string | null;
          partner_ship_eta?: string | null;
          partner_tracking_no?: string | null;
          po_number?: string | null;
          received_at?: string | null;
          sent_at?: string | null;
          source?: string;
          status?: string;
          subtotal?: number;
          supplier_id?: string | null;
          supply_partner_id?: string | null;
          tenant_id?: string;
          transport?: string | null;
          transport_error?: string | null;
          transport_status?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_supply_partner_id_fkey";
            columns: ["supply_partner_id"];
            isOneToOne: false;
            referencedRelation: "supply_partners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      push_tokens: {
        Row: {
          created_at: string | null;
          id: string;
          platform: string;
          tenant_id: string;
          token: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          platform: string;
          tenant_id: string;
          token: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          platform?: string;
          tenant_id?: string;
          token?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_tokens_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      register_sessions: {
        Row: {
          cash_difference: number | null;
          closed_at: string | null;
          closed_by: string | null;
          closing_cash: number | null;
          created_at: string;
          expected_cash: number | null;
          id: string;
          note: string | null;
          opened_at: string;
          opened_by: string;
          opening_cash: number;
          register_id: string;
          status: string;
          tenant_id: string;
          total_sales: number | null;
          total_transactions: number | null;
          updated_at: string;
        };
        Insert: {
          cash_difference?: number | null;
          closed_at?: string | null;
          closed_by?: string | null;
          closing_cash?: number | null;
          created_at?: string;
          expected_cash?: number | null;
          id?: string;
          note?: string | null;
          opened_at?: string;
          opened_by: string;
          opening_cash?: number;
          register_id: string;
          status?: string;
          tenant_id: string;
          total_sales?: number | null;
          total_transactions?: number | null;
          updated_at?: string;
        };
        Update: {
          cash_difference?: number | null;
          closed_at?: string | null;
          closed_by?: string | null;
          closing_cash?: number | null;
          created_at?: string;
          expected_cash?: number | null;
          id?: string;
          note?: string | null;
          opened_at?: string;
          opened_by?: string;
          opening_cash?: number;
          register_id?: string;
          status?: string;
          tenant_id?: string;
          total_sales?: number | null;
          total_transactions?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "register_sessions_register_id_fkey";
            columns: ["register_id"];
            isOneToOne: false;
            referencedRelation: "registers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "register_sessions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      registers: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number;
          store_id: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number;
          store_id: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
          store_id?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "registers_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "registers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      reservation_holds: {
        Row: {
          created_at: string;
          end_time: string;
          expires_at: string;
          held_by_tenant_id: string;
          id: string;
          job_order_id: string | null;
          scheduled_date: string;
          start_time: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          end_time: string;
          expires_at: string;
          held_by_tenant_id: string;
          id?: string;
          job_order_id?: string | null;
          scheduled_date: string;
          start_time: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          end_time?: string;
          expires_at?: string;
          held_by_tenant_id?: string;
          id?: string;
          job_order_id?: string | null;
          scheduled_date?: string;
          start_time?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reservation_holds_held_by_tenant_id_fkey";
            columns: ["held_by_tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservation_holds_job_order_id_fkey";
            columns: ["job_order_id"];
            isOneToOne: false;
            referencedRelation: "job_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservation_holds_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      reservation_step_logs: {
        Row: {
          completed_at: string | null;
          completed_by: string | null;
          duration_sec: number | null;
          id: string;
          note: string | null;
          reservation_id: string;
          started_at: string | null;
          step_key: string;
          step_label: string;
          step_order: number;
          tenant_id: string;
        };
        Insert: {
          completed_at?: string | null;
          completed_by?: string | null;
          duration_sec?: number | null;
          id?: string;
          note?: string | null;
          reservation_id: string;
          started_at?: string | null;
          step_key: string;
          step_label: string;
          step_order: number;
          tenant_id: string;
        };
        Update: {
          completed_at?: string | null;
          completed_by?: string | null;
          duration_sec?: number | null;
          id?: string;
          note?: string | null;
          reservation_id?: string;
          started_at?: string | null;
          step_key?: string;
          step_label?: string;
          step_order?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reservation_step_logs_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
        ];
      };
      reservations: {
        Row: {
          ai_accounting_suggestion: Json | null;
          ai_assignee_suggestion: Json | null;
          ai_certificate_draft: Json | null;
          ai_certificate_id: string | null;
          ai_next_action: Json | null;
          ai_workflow_proposal: Json | null;
          all_day: boolean;
          assigned_staff_id: string | null;
          assigned_user_id: string | null;
          booth_id: string | null;
          cancel_reason: string | null;
          cancelled_at: string | null;
          created_at: string | null;
          current_step_key: string | null;
          current_step_order: number | null;
          customer_id: string | null;
          end_time: string | null;
          estimated_amount: number | null;
          estimated_minutes: number | null;
          gcal_calendar_id: string | null;
          gcal_event_id: string | null;
          handoff_notes: Json;
          id: string;
          line_user_id: string | null;
          loaner_car_id: string | null;
          menu_items_json: Json | null;
          note: string | null;
          parts_replacement: boolean;
          payment_id: string | null;
          payment_status: string | null;
          progress_note: string | null;
          progress_pct: number | null;
          scheduled_date: string;
          signed_off_at: string | null;
          signoff_deadline: string | null;
          signoff_requested_at: string | null;
          signoff_status: string;
          source: string;
          start_time: string | null;
          status: string;
          store_id: string | null;
          sub_status: string | null;
          tenant_id: string;
          title: string;
          updated_at: string | null;
          vehicle_id: string | null;
          work_completed_at: string | null;
          work_gps_at: string | null;
          work_lat: number | null;
          work_lng: number | null;
          work_started_at: string | null;
          workflow_template_id: string | null;
        };
        Insert: {
          ai_accounting_suggestion?: Json | null;
          ai_assignee_suggestion?: Json | null;
          ai_certificate_draft?: Json | null;
          ai_certificate_id?: string | null;
          ai_next_action?: Json | null;
          ai_workflow_proposal?: Json | null;
          all_day?: boolean;
          assigned_staff_id?: string | null;
          assigned_user_id?: string | null;
          booth_id?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          created_at?: string | null;
          current_step_key?: string | null;
          current_step_order?: number | null;
          customer_id?: string | null;
          end_time?: string | null;
          estimated_amount?: number | null;
          estimated_minutes?: number | null;
          gcal_calendar_id?: string | null;
          gcal_event_id?: string | null;
          handoff_notes?: Json;
          id?: string;
          line_user_id?: string | null;
          loaner_car_id?: string | null;
          menu_items_json?: Json | null;
          note?: string | null;
          parts_replacement?: boolean;
          payment_id?: string | null;
          payment_status?: string | null;
          progress_note?: string | null;
          progress_pct?: number | null;
          scheduled_date: string;
          signed_off_at?: string | null;
          signoff_deadline?: string | null;
          signoff_requested_at?: string | null;
          signoff_status?: string;
          source?: string;
          start_time?: string | null;
          status?: string;
          store_id?: string | null;
          sub_status?: string | null;
          tenant_id: string;
          title: string;
          updated_at?: string | null;
          vehicle_id?: string | null;
          work_completed_at?: string | null;
          work_gps_at?: string | null;
          work_lat?: number | null;
          work_lng?: number | null;
          work_started_at?: string | null;
          workflow_template_id?: string | null;
        };
        Update: {
          ai_accounting_suggestion?: Json | null;
          ai_assignee_suggestion?: Json | null;
          ai_certificate_draft?: Json | null;
          ai_certificate_id?: string | null;
          ai_next_action?: Json | null;
          ai_workflow_proposal?: Json | null;
          all_day?: boolean;
          assigned_staff_id?: string | null;
          assigned_user_id?: string | null;
          booth_id?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          created_at?: string | null;
          current_step_key?: string | null;
          current_step_order?: number | null;
          customer_id?: string | null;
          end_time?: string | null;
          estimated_amount?: number | null;
          estimated_minutes?: number | null;
          gcal_calendar_id?: string | null;
          gcal_event_id?: string | null;
          handoff_notes?: Json;
          id?: string;
          line_user_id?: string | null;
          loaner_car_id?: string | null;
          menu_items_json?: Json | null;
          note?: string | null;
          parts_replacement?: boolean;
          payment_id?: string | null;
          payment_status?: string | null;
          progress_note?: string | null;
          progress_pct?: number | null;
          scheduled_date?: string;
          signed_off_at?: string | null;
          signoff_deadline?: string | null;
          signoff_requested_at?: string | null;
          signoff_status?: string;
          source?: string;
          start_time?: string | null;
          status?: string;
          store_id?: string | null;
          sub_status?: string | null;
          tenant_id?: string;
          title?: string;
          updated_at?: string | null;
          vehicle_id?: string | null;
          work_completed_at?: string | null;
          work_gps_at?: string | null;
          work_lat?: number | null;
          work_lng?: number | null;
          work_started_at?: string | null;
          workflow_template_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_reservations_payment";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservations_ai_certificate_id_fkey";
            columns: ["ai_certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservations_assigned_staff_id_fkey";
            columns: ["assigned_staff_id"];
            isOneToOne: false;
            referencedRelation: "staff_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservations_booth_id_fkey";
            columns: ["booth_id"];
            isOneToOne: false;
            referencedRelation: "booths";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservations_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservations_loaner_car_id_fkey";
            columns: ["loaner_car_id"];
            isOneToOne: false;
            referencedRelation: "loaner_cars";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservations_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservations_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservations_workflow_template_id_fkey";
            columns: ["workflow_template_id"];
            isOneToOne: false;
            referencedRelation: "workflow_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_targets: {
        Row: {
          created_at: string;
          id: string;
          month: number;
          target_jobs: number | null;
          target_new_customers: number | null;
          target_revenue: number | null;
          tenant_id: string;
          updated_at: string;
          year: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          month: number;
          target_jobs?: number | null;
          target_new_customers?: number | null;
          target_revenue?: number | null;
          tenant_id: string;
          updated_at?: string;
          year: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          month?: number;
          target_jobs?: number | null;
          target_new_customers?: number | null;
          target_revenue?: number | null;
          tenant_id?: string;
          updated_at?: string;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sales_targets_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_news: {
        Row: {
          category: string;
          fetched_at: string | null;
          id: string;
          is_relevant: boolean | null;
          keywords: string[] | null;
          published_at: string;
          source: string;
          summary: string | null;
          title: string;
          url: string | null;
        };
        Insert: {
          category: string;
          fetched_at?: string | null;
          id?: string;
          is_relevant?: boolean | null;
          keywords?: string[] | null;
          published_at: string;
          source: string;
          summary?: string | null;
          title: string;
          url?: string | null;
        };
        Update: {
          category?: string;
          fetched_at?: string | null;
          id?: string;
          is_relevant?: boolean | null;
          keywords?: string[] | null;
          published_at?: string;
          source?: string;
          summary?: string | null;
          title?: string;
          url?: string | null;
        };
        Relationships: [];
      };
      service_package_items: {
        Row: {
          created_at: string;
          id: string;
          is_archived: boolean;
          menu_item_id: string;
          override_unit_price: number | null;
          package_id: string;
          quantity: number;
          sort_order: number;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_archived?: boolean;
          menu_item_id: string;
          override_unit_price?: number | null;
          package_id: string;
          quantity?: number;
          sort_order?: number;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_archived?: boolean;
          menu_item_id?: string;
          override_unit_price?: number | null;
          package_id?: string;
          quantity?: number;
          sort_order?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_package_items_menu_item_id_fkey";
            columns: ["menu_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_package_items_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "service_packages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_package_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      service_packages: {
        Row: {
          category: string;
          created_at: string;
          description: string | null;
          fixed_price: number | null;
          id: string;
          is_archived: boolean;
          name: string;
          price_strategy: string;
          recommended_template_id: string | null;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          category?: string;
          created_at?: string;
          description?: string | null;
          fixed_price?: number | null;
          id?: string;
          is_archived?: boolean;
          name: string;
          price_strategy?: string;
          recommended_template_id?: string | null;
          sort_order?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          description?: string | null;
          fixed_price?: number | null;
          id?: string;
          is_archived?: boolean;
          name?: string;
          price_strategy?: string;
          recommended_template_id?: string | null;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_packages_recommended_template_id_fkey";
            columns: ["recommended_template_id"];
            isOneToOne: false;
            referencedRelation: "templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_packages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      service_reminders: {
        Row: {
          completed_at: string | null;
          created_at: string;
          customer_id: string | null;
          id: string;
          last_service_date: string | null;
          last_service_mileage: number | null;
          next_due_date: string | null;
          next_due_mileage: number | null;
          notes: string | null;
          notified_at: string | null;
          recommended_interval_km: number | null;
          recommended_interval_months: number | null;
          reminder_type: string;
          service_name: string;
          status: string;
          tenant_id: string;
          updated_at: string;
          vehicle_id: string | null;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          last_service_date?: string | null;
          last_service_mileage?: number | null;
          next_due_date?: string | null;
          next_due_mileage?: number | null;
          notes?: string | null;
          notified_at?: string | null;
          recommended_interval_km?: number | null;
          recommended_interval_months?: number | null;
          reminder_type?: string;
          service_name: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          customer_id?: string | null;
          id?: string;
          last_service_date?: string | null;
          last_service_mileage?: number | null;
          next_due_date?: string | null;
          next_due_mileage?: number | null;
          notes?: string | null;
          notified_at?: string | null;
          recommended_interval_km?: number | null;
          recommended_interval_months?: number | null;
          reminder_type?: string;
          service_name?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "service_reminders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_reminders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_reminders_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      shop_announcements: {
        Row: {
          body: string;
          created_at: string;
          created_by: string | null;
          id: string;
          published: boolean;
          published_at: string | null;
          tenant_id: string;
          title: string;
          translated_at: string | null;
          translations: Json | null;
          updated_at: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          published?: boolean;
          published_at?: string | null;
          tenant_id: string;
          title: string;
          translated_at?: string | null;
          translations?: Json | null;
          updated_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          published?: boolean;
          published_at?: string | null;
          tenant_id?: string;
          title?: string;
          translated_at?: string | null;
          translations?: Json | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shop_announcements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      shop_order_items: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          meta: Json;
          order_id: string;
          product_id: string;
          product_name: string;
          quantity: number;
          tax_rate: number;
          unit_price: number;
        };
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          meta?: Json;
          order_id: string;
          product_id: string;
          product_name: string;
          quantity?: number;
          tax_rate?: number;
          unit_price: number;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          meta?: Json;
          order_id?: string;
          product_id?: string;
          product_name?: string;
          quantity?: number;
          tax_rate?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "shop_order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "shop_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shop_order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "shop_products";
            referencedColumns: ["id"];
          },
        ];
      };
      shop_orders: {
        Row: {
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          note: string | null;
          order_number: string;
          payment_method: string;
          shipped_at: string | null;
          status: string;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          subtotal: number;
          tax: number;
          tenant_id: string;
          total: number;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note?: string | null;
          order_number: string;
          payment_method: string;
          shipped_at?: string | null;
          status?: string;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          subtotal?: number;
          tax?: number;
          tenant_id: string;
          total?: number;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note?: string | null;
          order_number?: string;
          payment_method?: string;
          shipped_at?: string | null;
          status?: string;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          subtotal?: number;
          tax?: number;
          tenant_id?: string;
          total?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shop_orders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      shop_price_submissions: {
        Row: {
          created_at: string;
          dealer_id: string;
          id: string;
          notes: string | null;
          prefecture: string;
          price_max: number | null;
          price_min: number | null;
          price_typical: number | null;
          service_category: string;
          service_name: string;
          unit: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          dealer_id: string;
          id?: string;
          notes?: string | null;
          prefecture: string;
          price_max?: number | null;
          price_min?: number | null;
          price_typical?: number | null;
          service_category: string;
          service_name: string;
          unit?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          dealer_id?: string;
          id?: string;
          notes?: string | null;
          prefecture?: string;
          price_max?: number | null;
          price_min?: number | null;
          price_typical?: number | null;
          service_category?: string;
          service_name?: string;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shop_price_submissions_dealer_id_fkey";
            columns: ["dealer_id"];
            isOneToOne: false;
            referencedRelation: "dealers";
            referencedColumns: ["id"];
          },
        ];
      };
      shop_products: {
        Row: {
          category: string;
          created_at: string;
          description: string | null;
          id: string;
          image_path: string | null;
          is_active: boolean;
          meta: Json;
          min_quantity: number;
          name: string;
          price: number;
          sort_order: number;
          tax_rate: number;
          unit: string;
          updated_at: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_path?: string | null;
          is_active?: boolean;
          meta?: Json;
          min_quantity?: number;
          name: string;
          price: number;
          sort_order?: number;
          tax_rate?: number;
          unit?: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_path?: string | null;
          is_active?: boolean;
          meta?: Json;
          min_quantity?: number;
          name?: string;
          price?: number;
          sort_order?: number;
          tax_rate?: number;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      signature_audit_logs: {
        Row: {
          created_at: string;
          event: string;
          id: string;
          ip: string | null;
          metadata: Json;
          session_id: string;
          user_agent: string | null;
        };
        Insert: {
          created_at?: string;
          event: string;
          id?: string;
          ip?: string | null;
          metadata?: Json;
          session_id: string;
          user_agent?: string | null;
        };
        Update: {
          created_at?: string;
          event?: string;
          id?: string;
          ip?: string | null;
          metadata?: Json;
          session_id?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "signature_audit_logs_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "signature_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      signature_public_keys: {
        Row: {
          activated_at: string;
          created_at: string;
          deactivated_at: string | null;
          description: string | null;
          fingerprint: string;
          id: string;
          is_active: boolean;
          key_version: string;
          public_key: string;
        };
        Insert: {
          activated_at?: string;
          created_at?: string;
          deactivated_at?: string | null;
          description?: string | null;
          fingerprint: string;
          id?: string;
          is_active?: boolean;
          key_version: string;
          public_key: string;
        };
        Update: {
          activated_at?: string;
          created_at?: string;
          deactivated_at?: string | null;
          description?: string | null;
          fingerprint?: string;
          id?: string;
          is_active?: boolean;
          key_version?: string;
          public_key?: string;
        };
        Relationships: [];
      };
      signature_reviews: {
        Row: {
          ai_actionable: boolean | null;
          ai_analyzed_at: string | null;
          ai_confidence: number | null;
          ai_sentiment: string | null;
          ai_summary: string | null;
          ai_topics: Json | null;
          certificate_id: string | null;
          comment: string | null;
          created_at: string;
          customer_id: string | null;
          google_redirected_at: string | null;
          id: string;
          ip: string | null;
          rating: number;
          signature_session_id: string;
          tenant_id: string;
          user_agent: string | null;
        };
        Insert: {
          ai_actionable?: boolean | null;
          ai_analyzed_at?: string | null;
          ai_confidence?: number | null;
          ai_sentiment?: string | null;
          ai_summary?: string | null;
          ai_topics?: Json | null;
          certificate_id?: string | null;
          comment?: string | null;
          created_at?: string;
          customer_id?: string | null;
          google_redirected_at?: string | null;
          id?: string;
          ip?: string | null;
          rating: number;
          signature_session_id: string;
          tenant_id: string;
          user_agent?: string | null;
        };
        Update: {
          ai_actionable?: boolean | null;
          ai_analyzed_at?: string | null;
          ai_confidence?: number | null;
          ai_sentiment?: string | null;
          ai_summary?: string | null;
          ai_topics?: Json | null;
          certificate_id?: string | null;
          comment?: string | null;
          created_at?: string;
          customer_id?: string | null;
          google_redirected_at?: string | null;
          id?: string;
          ip?: string | null;
          rating?: number;
          signature_session_id?: string;
          tenant_id?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "signature_reviews_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signature_reviews_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signature_reviews_signature_session_id_fkey";
            columns: ["signature_session_id"];
            isOneToOne: true;
            referencedRelation: "signature_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signature_reviews_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      signature_sessions: {
        Row: {
          cancel_reason: string | null;
          cancelled_at: string | null;
          certificate_id: string | null;
          consent_text_hash: string | null;
          consent_version: string | null;
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          document_hash: string;
          document_hash_alg: string;
          expires_at: string;
          id: string;
          key_version: string | null;
          last_reminded_at: string | null;
          line_user_id: string | null;
          notification_method: string;
          notification_sent_at: string | null;
          notified_channel: string | null;
          phone_last4_hash: string | null;
          public_key_fingerprint: string | null;
          purpose: string;
          remind_count: number;
          reservation_id: string | null;
          secondary_factor_attempts: number;
          secondary_factor_required: boolean;
          secondary_factor_verified: boolean;
          signature: string | null;
          signed_at: string | null;
          signer_confirmed_email: string | null;
          signer_email: string | null;
          signer_ip: string | null;
          signer_name: string | null;
          signer_phone: string | null;
          signer_user_agent: string | null;
          signing_payload: string | null;
          status: string;
          tenant_id: string;
          token: string;
          updated_at: string;
        };
        Insert: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          certificate_id?: string | null;
          consent_text_hash?: string | null;
          consent_version?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          document_hash: string;
          document_hash_alg?: string;
          expires_at: string;
          id?: string;
          key_version?: string | null;
          last_reminded_at?: string | null;
          line_user_id?: string | null;
          notification_method?: string;
          notification_sent_at?: string | null;
          notified_channel?: string | null;
          phone_last4_hash?: string | null;
          public_key_fingerprint?: string | null;
          purpose?: string;
          remind_count?: number;
          reservation_id?: string | null;
          secondary_factor_attempts?: number;
          secondary_factor_required?: boolean;
          secondary_factor_verified?: boolean;
          signature?: string | null;
          signed_at?: string | null;
          signer_confirmed_email?: string | null;
          signer_email?: string | null;
          signer_ip?: string | null;
          signer_name?: string | null;
          signer_phone?: string | null;
          signer_user_agent?: string | null;
          signing_payload?: string | null;
          status?: string;
          tenant_id: string;
          token: string;
          updated_at?: string;
        };
        Update: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          certificate_id?: string | null;
          consent_text_hash?: string | null;
          consent_version?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          document_hash?: string;
          document_hash_alg?: string;
          expires_at?: string;
          id?: string;
          key_version?: string | null;
          last_reminded_at?: string | null;
          line_user_id?: string | null;
          notification_method?: string;
          notification_sent_at?: string | null;
          notified_channel?: string | null;
          phone_last4_hash?: string | null;
          public_key_fingerprint?: string | null;
          purpose?: string;
          remind_count?: number;
          reservation_id?: string | null;
          secondary_factor_attempts?: number;
          secondary_factor_required?: boolean;
          secondary_factor_verified?: boolean;
          signature?: string | null;
          signed_at?: string | null;
          signer_confirmed_email?: string | null;
          signer_email?: string | null;
          signer_ip?: string | null;
          signer_name?: string | null;
          signer_phone?: string | null;
          signer_user_agent?: string | null;
          signing_payload?: string | null;
          status?: string;
          tenant_id?: string;
          token?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "signature_sessions_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signature_sessions_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signature_sessions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      site_content_posts: {
        Row: {
          author: string | null;
          body: string;
          capacity: number | null;
          created_at: string;
          created_by: string | null;
          cta_primary_href: string | null;
          cta_primary_label: string | null;
          cta_secondary_href: string | null;
          cta_secondary_label: string | null;
          cta_subtitle: string | null;
          cta_title: string | null;
          event_end_at: string | null;
          event_start_at: string | null;
          excerpt: string | null;
          hero_image_url: string | null;
          id: string;
          location: string | null;
          og_subtitle: string | null;
          og_title: string | null;
          online_url: string | null;
          published_at: string | null;
          registration_url: string | null;
          slug: string;
          status: string;
          tags: string[];
          tenant_id: string | null;
          title: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          author?: string | null;
          body?: string;
          capacity?: number | null;
          created_at?: string;
          created_by?: string | null;
          cta_primary_href?: string | null;
          cta_primary_label?: string | null;
          cta_secondary_href?: string | null;
          cta_secondary_label?: string | null;
          cta_subtitle?: string | null;
          cta_title?: string | null;
          event_end_at?: string | null;
          event_start_at?: string | null;
          excerpt?: string | null;
          hero_image_url?: string | null;
          id?: string;
          location?: string | null;
          og_subtitle?: string | null;
          og_title?: string | null;
          online_url?: string | null;
          published_at?: string | null;
          registration_url?: string | null;
          slug: string;
          status?: string;
          tags?: string[];
          tenant_id?: string | null;
          title: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          author?: string | null;
          body?: string;
          capacity?: number | null;
          created_at?: string;
          created_by?: string | null;
          cta_primary_href?: string | null;
          cta_primary_label?: string | null;
          cta_secondary_href?: string | null;
          cta_secondary_label?: string | null;
          cta_subtitle?: string | null;
          cta_title?: string | null;
          event_end_at?: string | null;
          event_start_at?: string | null;
          excerpt?: string | null;
          hero_image_url?: string | null;
          id?: string;
          location?: string | null;
          og_subtitle?: string | null;
          og_title?: string | null;
          online_url?: string | null;
          published_at?: string | null;
          registration_url?: string | null;
          slug?: string;
          status?: string;
          tags?: string[];
          tenant_id?: string | null;
          title?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_content_posts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      square_connections: {
        Row: {
          connected_at: string | null;
          connected_by: string | null;
          created_at: string | null;
          id: string;
          last_error_at: string | null;
          last_error_reason: string | null;
          last_synced_at: string | null;
          square_access_token_ciphertext: string | null;
          square_location_ids: string[] | null;
          square_merchant_id: string;
          square_refresh_token_ciphertext: string | null;
          square_token_expires_at: string;
          status: string;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          connected_at?: string | null;
          connected_by?: string | null;
          created_at?: string | null;
          id?: string;
          last_error_at?: string | null;
          last_error_reason?: string | null;
          last_synced_at?: string | null;
          square_access_token_ciphertext?: string | null;
          square_location_ids?: string[] | null;
          square_merchant_id: string;
          square_refresh_token_ciphertext?: string | null;
          square_token_expires_at: string;
          status?: string;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          connected_at?: string | null;
          connected_by?: string | null;
          created_at?: string | null;
          id?: string;
          last_error_at?: string | null;
          last_error_reason?: string | null;
          last_synced_at?: string | null;
          square_access_token_ciphertext?: string | null;
          square_location_ids?: string[] | null;
          square_merchant_id?: string;
          square_refresh_token_ciphertext?: string | null;
          square_token_expires_at?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "square_connections_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      square_orders: {
        Row: {
          certificate_id: string | null;
          created_at: string | null;
          currency: string | null;
          customer_id: string | null;
          discount_amount: number | null;
          id: string;
          items_json: Json | null;
          net_amount: number;
          note: string | null;
          order_state: string | null;
          payment_methods: string[] | null;
          raw_json: Json | null;
          receipt_document_id: string | null;
          square_closed_at: string | null;
          square_created_at: string;
          square_customer_id: string | null;
          square_location_id: string;
          square_order_id: string;
          square_receipt_url: string | null;
          synced_at: string | null;
          tax_amount: number | null;
          tenant_id: string;
          tenders_json: Json | null;
          tip_amount: number | null;
          total_amount: number;
          updated_at: string | null;
          vehicle_id: string | null;
        };
        Insert: {
          certificate_id?: string | null;
          created_at?: string | null;
          currency?: string | null;
          customer_id?: string | null;
          discount_amount?: number | null;
          id?: string;
          items_json?: Json | null;
          net_amount: number;
          note?: string | null;
          order_state?: string | null;
          payment_methods?: string[] | null;
          raw_json?: Json | null;
          receipt_document_id?: string | null;
          square_closed_at?: string | null;
          square_created_at: string;
          square_customer_id?: string | null;
          square_location_id: string;
          square_order_id: string;
          square_receipt_url?: string | null;
          synced_at?: string | null;
          tax_amount?: number | null;
          tenant_id: string;
          tenders_json?: Json | null;
          tip_amount?: number | null;
          total_amount: number;
          updated_at?: string | null;
          vehicle_id?: string | null;
        };
        Update: {
          certificate_id?: string | null;
          created_at?: string | null;
          currency?: string | null;
          customer_id?: string | null;
          discount_amount?: number | null;
          id?: string;
          items_json?: Json | null;
          net_amount?: number;
          note?: string | null;
          order_state?: string | null;
          payment_methods?: string[] | null;
          raw_json?: Json | null;
          receipt_document_id?: string | null;
          square_closed_at?: string | null;
          square_created_at?: string;
          square_customer_id?: string | null;
          square_location_id?: string;
          square_order_id?: string;
          square_receipt_url?: string | null;
          synced_at?: string | null;
          tax_amount?: number | null;
          tenant_id?: string;
          tenders_json?: Json | null;
          tip_amount?: number | null;
          total_amount?: number;
          updated_at?: string | null;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "square_orders_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "square_orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "square_orders_receipt_document_id_fkey";
            columns: ["receipt_document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "square_orders_receipt_document_id_fkey";
            columns: ["receipt_document_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "square_orders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "square_orders_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      square_sync_runs: {
        Row: {
          created_at: string | null;
          cursor: string | null;
          cursor_state: string | null;
          error_message: string | null;
          errors_json: Json | null;
          finished_at: string | null;
          id: string;
          orders_fetched: number | null;
          orders_imported: number | null;
          orders_skipped: number | null;
          processed_count: number | null;
          started_at: string | null;
          status: string;
          sync_from: string | null;
          sync_to: string | null;
          tenant_id: string;
          trigger_type: string;
          triggered_by: string | null;
        };
        Insert: {
          created_at?: string | null;
          cursor?: string | null;
          cursor_state?: string | null;
          error_message?: string | null;
          errors_json?: Json | null;
          finished_at?: string | null;
          id?: string;
          orders_fetched?: number | null;
          orders_imported?: number | null;
          orders_skipped?: number | null;
          processed_count?: number | null;
          started_at?: string | null;
          status?: string;
          sync_from?: string | null;
          sync_to?: string | null;
          tenant_id: string;
          trigger_type: string;
          triggered_by?: string | null;
        };
        Update: {
          created_at?: string | null;
          cursor?: string | null;
          cursor_state?: string | null;
          error_message?: string | null;
          errors_json?: Json | null;
          finished_at?: string | null;
          id?: string;
          orders_fetched?: number | null;
          orders_imported?: number | null;
          orders_skipped?: number | null;
          processed_count?: number | null;
          started_at?: string | null;
          status?: string;
          sync_from?: string | null;
          sync_to?: string | null;
          tenant_id?: string;
          trigger_type?: string;
          triggered_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "square_sync_runs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_members: {
        Row: {
          color: string | null;
          commission_rate: number | null;
          created_at: string;
          email: string | null;
          id: string;
          is_active: boolean;
          kind: string;
          name: string;
          note: string | null;
          phone: string | null;
          skills: string[];
          tenant_id: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          color?: string | null;
          commission_rate?: number | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          kind?: string;
          name: string;
          note?: string | null;
          phone?: string | null;
          skills?: string[];
          tenant_id: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          color?: string | null;
          commission_rate?: number | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          kind?: string;
          name?: string;
          note?: string | null;
          phone?: string | null;
          skills?: string[];
          tenant_id?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "staff_members_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_shifts: {
        Row: {
          created_at: string;
          end_time: string | null;
          id: string;
          note: string | null;
          staff_id: string;
          start_time: string | null;
          tenant_id: string;
          updated_at: string;
          work_date: string;
        };
        Insert: {
          created_at?: string;
          end_time?: string | null;
          id?: string;
          note?: string | null;
          staff_id: string;
          start_time?: string | null;
          tenant_id: string;
          updated_at?: string;
          work_date: string;
        };
        Update: {
          created_at?: string;
          end_time?: string | null;
          id?: string;
          note?: string | null;
          staff_id?: string;
          start_time?: string | null;
          tenant_id?: string;
          updated_at?: string;
          work_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_shifts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_shifts_tenant_id_staff_id_fkey";
            columns: ["tenant_id", "staff_id"];
            isOneToOne: false;
            referencedRelation: "staff_members";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      standard_rules: {
        Row: {
          category: string;
          category_label: string;
          created_at: string;
          id: string;
          is_active: boolean;
          required_fields: Json;
          required_photos: Json;
          standard_level: string;
          updated_at: string;
          version: number;
          warning_rules: Json;
        };
        Insert: {
          category: string;
          category_label: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          required_fields?: Json;
          required_photos?: Json;
          standard_level?: string;
          updated_at?: string;
          version?: number;
          warning_rules?: Json;
        };
        Update: {
          category?: string;
          category_label?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          required_fields?: Json;
          required_photos?: Json;
          standard_level?: string;
          updated_at?: string;
          version?: number;
          warning_rules?: Json;
        };
        Relationships: [];
      };
      stocktake_items: {
        Row: {
          counted_qty: number | null;
          created_at: string;
          expected_qty: number;
          id: string;
          menu_item_id: string;
          notes: string | null;
          session_id: string;
          tenant_id: string;
          unit: string | null;
          updated_at: string;
        };
        Insert: {
          counted_qty?: number | null;
          created_at?: string;
          expected_qty?: number;
          id?: string;
          menu_item_id: string;
          notes?: string | null;
          session_id: string;
          tenant_id: string;
          unit?: string | null;
          updated_at?: string;
        };
        Update: {
          counted_qty?: number | null;
          created_at?: string;
          expected_qty?: number;
          id?: string;
          menu_item_id?: string;
          notes?: string | null;
          session_id?: string;
          tenant_id?: string;
          unit?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stocktake_items_menu_item_id_fkey";
            columns: ["menu_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stocktake_items_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "stocktake_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stocktake_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      stocktake_sessions: {
        Row: {
          closed_at: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          notes: string | null;
          started_at: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          started_at?: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          started_at?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stocktake_sessions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      store_memberships: {
        Row: {
          created_at: string | null;
          id: string;
          role: string;
          store_id: string;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          role?: string;
          store_id: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          role?: string;
          store_id?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "store_memberships_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "store_memberships_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      stores: {
        Row: {
          address: string | null;
          business_hours: Json | null;
          capacity: number | null;
          created_at: string | null;
          email: string | null;
          id: string;
          is_active: boolean;
          is_default: boolean;
          latitude: number | null;
          longitude: number | null;
          manager_name: string | null;
          name: string;
          phone: string | null;
          sort_order: number | null;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          address?: string | null;
          business_hours?: Json | null;
          capacity?: number | null;
          created_at?: string | null;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          manager_name?: string | null;
          name: string;
          phone?: string | null;
          sort_order?: number | null;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          address?: string | null;
          business_hours?: Json | null;
          capacity?: number | null;
          created_at?: string | null;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          manager_name?: string | null;
          name?: string;
          phone?: string | null;
          sort_order?: number | null;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stores_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      stripe_connect_transfers: {
        Row: {
          agent_id: string | null;
          amount: number;
          created_at: string;
          currency: string;
          failure_message: string | null;
          fee_amount: number;
          id: string;
          metadata: Json | null;
          reversed_at: string | null;
          source_id: string | null;
          source_type: string | null;
          status: string;
          stripe_account_id: string;
          stripe_application_fee_id: string | null;
          stripe_payment_intent_id: string | null;
          stripe_transfer_id: string;
          tenant_id: string | null;
          transferred_at: string | null;
          updated_at: string;
        };
        Insert: {
          agent_id?: string | null;
          amount: number;
          created_at?: string;
          currency?: string;
          failure_message?: string | null;
          fee_amount?: number;
          id?: string;
          metadata?: Json | null;
          reversed_at?: string | null;
          source_id?: string | null;
          source_type?: string | null;
          status?: string;
          stripe_account_id: string;
          stripe_application_fee_id?: string | null;
          stripe_payment_intent_id?: string | null;
          stripe_transfer_id: string;
          tenant_id?: string | null;
          transferred_at?: string | null;
          updated_at?: string;
        };
        Update: {
          agent_id?: string | null;
          amount?: number;
          created_at?: string;
          currency?: string;
          failure_message?: string | null;
          fee_amount?: number;
          id?: string;
          metadata?: Json | null;
          reversed_at?: string | null;
          source_id?: string | null;
          source_type?: string | null;
          status?: string;
          stripe_account_id?: string;
          stripe_application_fee_id?: string | null;
          stripe_payment_intent_id?: string | null;
          stripe_transfer_id?: string;
          tenant_id?: string | null;
          transferred_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stripe_connect_transfers_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stripe_connect_transfers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      stripe_processed_events: {
        Row: {
          attempts: number;
          created_at: string;
          error_message: string | null;
          event_id: string;
          event_type: string;
          id: number;
          payload: Json | null;
          processed_at: string | null;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          error_message?: string | null;
          event_id: string;
          event_type: string;
          id?: never;
          payload?: Json | null;
          processed_at?: string | null;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          error_message?: string | null;
          event_id?: string;
          event_type?: string;
          id?: never;
          payload?: Json | null;
          processed_at?: string | null;
        };
        Relationships: [];
      };
      suppliers: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          is_active: boolean;
          lead_time_days: number | null;
          name: string;
          note: string | null;
          phone: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          lead_time_days?: number | null;
          name: string;
          note?: string | null;
          phone?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          lead_time_days?: number | null;
          name?: string;
          note?: string | null;
          phone?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      supply_partner_credentials: {
        Row: {
          api_key_ciphertext: string | null;
          api_secret_ciphertext: string | null;
          created_at: string;
          rotated_at: string | null;
          supply_partner_id: string;
          updated_at: string;
          webhook_secret_ciphertext: string | null;
        };
        Insert: {
          api_key_ciphertext?: string | null;
          api_secret_ciphertext?: string | null;
          created_at?: string;
          rotated_at?: string | null;
          supply_partner_id: string;
          updated_at?: string;
          webhook_secret_ciphertext?: string | null;
        };
        Update: {
          api_key_ciphertext?: string | null;
          api_secret_ciphertext?: string | null;
          created_at?: string;
          rotated_at?: string | null;
          supply_partner_id?: string;
          updated_at?: string;
          webhook_secret_ciphertext?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "supply_partner_credentials_supply_partner_id_fkey";
            columns: ["supply_partner_id"];
            isOneToOne: true;
            referencedRelation: "supply_partners";
            referencedColumns: ["id"];
          },
        ];
      };
      supply_partner_line_link_codes: {
        Row: {
          code_hash: string;
          created_at: string;
          expires_at: string;
          id: string;
          supply_partner_id: string;
          used_at: string | null;
          used_line_user_id: string | null;
        };
        Insert: {
          code_hash: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          supply_partner_id: string;
          used_at?: string | null;
          used_line_user_id?: string | null;
        };
        Update: {
          code_hash?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          supply_partner_id?: string;
          used_at?: string | null;
          used_line_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "supply_partner_line_link_codes_supply_partner_id_fkey";
            columns: ["supply_partner_id"];
            isOneToOne: false;
            referencedRelation: "supply_partners";
            referencedColumns: ["id"];
          },
        ];
      };
      supply_partner_products: {
        Row: {
          category: string | null;
          created_at: string;
          currency: string;
          external_ref: Json | null;
          id: string;
          is_active: boolean;
          lead_time_days: number | null;
          list_price: number | null;
          name: string;
          sku: string;
          stock_status: string | null;
          supply_partner_id: string;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          currency?: string;
          external_ref?: Json | null;
          id?: string;
          is_active?: boolean;
          lead_time_days?: number | null;
          list_price?: number | null;
          name: string;
          sku: string;
          stock_status?: string | null;
          supply_partner_id: string;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          currency?: string;
          external_ref?: Json | null;
          id?: string;
          is_active?: boolean;
          lead_time_days?: number | null;
          list_price?: number | null;
          name?: string;
          sku?: string;
          stock_status?: string | null;
          supply_partner_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "supply_partner_products_supply_partner_id_fkey";
            columns: ["supply_partner_id"];
            isOneToOne: false;
            referencedRelation: "supply_partners";
            referencedColumns: ["id"];
          },
        ];
      };
      supply_partners: {
        Row: {
          agent_id: string | null;
          api_auth_type: string;
          api_config: Json | null;
          api_endpoint: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          created_at: string;
          id: string;
          integration_status: string;
          is_trusted: boolean;
          last_error: string | null;
          last_order_at: string | null;
          line_user_id: string | null;
          name: string;
          notes: string | null;
          owner_user_id: string | null;
          portal_enabled: boolean;
          status: string;
          updated_at: string;
        };
        Insert: {
          agent_id?: string | null;
          api_auth_type?: string;
          api_config?: Json | null;
          api_endpoint?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          id?: string;
          integration_status?: string;
          is_trusted?: boolean;
          last_error?: string | null;
          last_order_at?: string | null;
          line_user_id?: string | null;
          name: string;
          notes?: string | null;
          owner_user_id?: string | null;
          portal_enabled?: boolean;
          status?: string;
          updated_at?: string;
        };
        Update: {
          agent_id?: string | null;
          api_auth_type?: string;
          api_config?: Json | null;
          api_endpoint?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          id?: string;
          integration_status?: string;
          is_trusted?: boolean;
          last_error?: string | null;
          last_order_at?: string | null;
          line_user_id?: string | null;
          name?: string;
          notes?: string | null;
          owner_user_id?: string | null;
          portal_enabled?: boolean;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "supply_partners_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      support_faq: {
        Row: {
          answer: string;
          created_at: string;
          id: string;
          question: string;
          sort_order: number;
        };
        Insert: {
          answer: string;
          created_at?: string;
          id?: string;
          question: string;
          sort_order?: number;
        };
        Update: {
          answer?: string;
          created_at?: string;
          id?: string;
          question?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      support_ticket_messages: {
        Row: {
          created_at: string;
          id: string;
          message: string;
          sender_id: string;
          sender_type: string;
          ticket_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message: string;
          sender_id: string;
          sender_type: string;
          ticket_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string;
          sender_id?: string;
          sender_type?: string;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "support_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      support_tickets: {
        Row: {
          created_at: string;
          id: string;
          message: string;
          priority: string;
          status: string;
          subject: string;
          tenant_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message: string;
          priority?: string;
          status?: string;
          subject: string;
          tenant_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string;
          priority?: string;
          status?: string;
          subject?: string;
          tenant_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_tickets_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      system_health_snapshots: {
        Row: {
          captured_at: string;
          checks: Json;
          created_at: string;
          id: string;
          latency_ms: number | null;
          source: string;
          status: string;
        };
        Insert: {
          captured_at?: string;
          checks?: Json;
          created_at?: string;
          id?: string;
          latency_ms?: number | null;
          source?: string;
          status?: string;
        };
        Update: {
          captured_at?: string;
          checks?: Json;
          created_at?: string;
          id?: string;
          latency_ms?: number | null;
          source?: string;
          status?: string;
        };
        Relationships: [];
      };
      template_assets: {
        Row: {
          asset_type: string;
          content_type: string | null;
          created_at: string;
          file_name: string;
          file_size: number | null;
          id: string;
          storage_path: string;
          template_config_id: string | null;
          tenant_id: string;
        };
        Insert: {
          asset_type: string;
          content_type?: string | null;
          created_at?: string;
          file_name: string;
          file_size?: number | null;
          id?: string;
          storage_path: string;
          template_config_id?: string | null;
          tenant_id: string;
        };
        Update: {
          asset_type?: string;
          content_type?: string | null;
          created_at?: string;
          file_name?: string;
          file_size?: number | null;
          id?: string;
          storage_path?: string;
          template_config_id?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "template_assets_template_config_id_fkey";
            columns: ["template_config_id"];
            isOneToOne: false;
            referencedRelation: "tenant_template_configs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "template_assets_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      template_order_logs: {
        Row: {
          action: string;
          actor: string | null;
          created_at: string;
          from_status: string | null;
          id: string;
          message: string | null;
          meta_json: Json | null;
          order_id: string;
          to_status: string | null;
        };
        Insert: {
          action: string;
          actor?: string | null;
          created_at?: string;
          from_status?: string | null;
          id?: string;
          message?: string | null;
          meta_json?: Json | null;
          order_id: string;
          to_status?: string | null;
        };
        Update: {
          action?: string;
          actor?: string | null;
          created_at?: string;
          from_status?: string | null;
          id?: string;
          message?: string | null;
          meta_json?: Json | null;
          order_id?: string;
          to_status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "template_order_logs_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "template_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      template_orders: {
        Row: {
          amount: number;
          assets_json: Json | null;
          assigned_to: string | null;
          completed_at: string | null;
          created_at: string;
          due_date: string | null;
          hearing_json: Json | null;
          id: string;
          max_revisions: number;
          notes: string | null;
          order_type: string;
          revision_count: number;
          status: string;
          stripe_invoice_id: string | null;
          stripe_payment_intent_id: string | null;
          template_config_id: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          amount?: number;
          assets_json?: Json | null;
          assigned_to?: string | null;
          completed_at?: string | null;
          created_at?: string;
          due_date?: string | null;
          hearing_json?: Json | null;
          id?: string;
          max_revisions?: number;
          notes?: string | null;
          order_type: string;
          revision_count?: number;
          status?: string;
          stripe_invoice_id?: string | null;
          stripe_payment_intent_id?: string | null;
          template_config_id?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          assets_json?: Json | null;
          assigned_to?: string | null;
          completed_at?: string | null;
          created_at?: string;
          due_date?: string | null;
          hearing_json?: Json | null;
          id?: string;
          max_revisions?: number;
          notes?: string | null;
          order_type?: string;
          revision_count?: number;
          status?: string;
          stripe_invoice_id?: string | null;
          stripe_payment_intent_id?: string | null;
          template_config_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "template_orders_template_config_id_fkey";
            columns: ["template_config_id"];
            isOneToOne: false;
            referencedRelation: "tenant_template_configs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "template_orders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      templates: {
        Row: {
          category: string;
          created_at: string;
          id: string;
          layout_version: number;
          name: string;
          schema_json: Json;
          scope: Database["public"]["Enums"]["template_scope_enum"];
          tenant_id: string | null;
        };
        Insert: {
          category?: string;
          created_at?: string;
          id?: string;
          layout_version?: number;
          name: string;
          schema_json?: Json;
          scope: Database["public"]["Enums"]["template_scope_enum"];
          tenant_id?: string | null;
        };
        Update: {
          category?: string;
          created_at?: string;
          id?: string;
          layout_version?: number;
          name?: string;
          schema_json?: Json;
          scope?: Database["public"]["Enums"]["template_scope_enum"];
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_addons: {
        Row: {
          addon_key: string;
          disabled_at: string | null;
          enabled_at: string;
          notes: string | null;
          tenant_id: string;
        };
        Insert: {
          addon_key: string;
          disabled_at?: string | null;
          enabled_at?: string;
          notes?: string | null;
          tenant_id: string;
        };
        Update: {
          addon_key?: string;
          disabled_at?: string | null;
          enabled_at?: string;
          notes?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_addons_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_ai_automation_settings: {
        Row: {
          auto_actions: Json;
          confidence_threshold: number;
          enabled: boolean;
          field_policies: Json;
          monthly_cost_cap_jpy: number | null;
          source_policies: Json;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          auto_actions?: Json;
          confidence_threshold?: number;
          enabled?: boolean;
          field_policies?: Json;
          monthly_cost_cap_jpy?: number | null;
          source_policies?: Json;
          tenant_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          auto_actions?: Json;
          confidence_threshold?: number;
          enabled?: boolean;
          field_policies?: Json;
          monthly_cost_cap_jpy?: number | null;
          source_policies?: Json;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_ai_automation_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_api_keys: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          expires_at: string | null;
          id: string;
          key_hash: string;
          last_used_at: string | null;
          prefix: string;
          revoked_at: string | null;
          scopes: string[];
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          expires_at?: string | null;
          id?: string;
          key_hash: string;
          last_used_at?: string | null;
          prefix: string;
          revoked_at?: string | null;
          scopes?: string[];
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          expires_at?: string | null;
          id?: string;
          key_hash?: string;
          last_used_at?: string | null;
          prefix?: string;
          revoked_at?: string | null;
          scopes?: string[];
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_api_keys_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_billing_settings: {
        Row: {
          billing_timing: string;
          created_at: string | null;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          billing_timing?: string;
          created_at?: string | null;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          billing_timing?: string;
          created_at?: string | null;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_billing_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_custom_domains: {
        Row: {
          created_at: string;
          hostname: string;
          id: string;
          last_check_at: string | null;
          last_error: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          vercel_domain_id: string | null;
          verification_token: string;
          verified_at: string | null;
        };
        Insert: {
          created_at?: string;
          hostname: string;
          id?: string;
          last_check_at?: string | null;
          last_error?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          vercel_domain_id?: string | null;
          verification_token: string;
          verified_at?: string | null;
        };
        Update: {
          created_at?: string;
          hostname?: string;
          id?: string;
          last_check_at?: string | null;
          last_error?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          vercel_domain_id?: string | null;
          verification_token?: string;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_custom_domains_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_daily_digests: {
        Row: {
          ai: boolean;
          created_at: string;
          digest_date: string;
          tenant_id: string;
          text: string;
          updated_at: string;
        };
        Insert: {
          ai?: boolean;
          created_at?: string;
          digest_date: string;
          tenant_id: string;
          text: string;
          updated_at?: string;
        };
        Update: {
          ai?: boolean;
          created_at?: string;
          digest_date?: string;
          tenant_id?: string;
          text?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_daily_digests_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_email_templates: {
        Row: {
          body_html: string;
          body_text: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          subject: string;
          tenant_id: string;
          topic: string;
          updated_at: string;
        };
        Insert: {
          body_html: string;
          body_text?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          subject: string;
          tenant_id: string;
          topic: string;
          updated_at?: string;
        };
        Update: {
          body_html?: string;
          body_text?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          subject?: string;
          tenant_id?: string;
          topic?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_email_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_feature_settings: {
        Row: {
          disabled_features: Json;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          disabled_features?: Json;
          tenant_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          disabled_features?: Json;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_feature_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_field_knowledge: {
        Row: {
          content: string;
          created_at: string;
          created_by: string | null;
          enabled: boolean;
          id: string;
          tags: string[];
          tenant_id: string;
          title: string;
          updated_at: string;
          vehicle_model: string | null;
        };
        Insert: {
          content: string;
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          id?: string;
          tags?: string[];
          tenant_id: string;
          title: string;
          updated_at?: string;
          vehicle_model?: string | null;
        };
        Update: {
          content?: string;
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          id?: string;
          tags?: string[];
          tenant_id?: string;
          title?: string;
          updated_at?: string;
          vehicle_model?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_field_knowledge_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_integrations: {
        Row: {
          access_token_ciphertext: string | null;
          connected_at: string | null;
          connected_by: string | null;
          created_at: string;
          external_account_id: string | null;
          external_account_name: string | null;
          id: string;
          last_error: string | null;
          metadata: Json;
          provider: string;
          refresh_token_ciphertext: string | null;
          scopes: string[];
          status: string;
          tenant_id: string;
          token_expires_at: string | null;
          updated_at: string;
        };
        Insert: {
          access_token_ciphertext?: string | null;
          connected_at?: string | null;
          connected_by?: string | null;
          created_at?: string;
          external_account_id?: string | null;
          external_account_name?: string | null;
          id?: string;
          last_error?: string | null;
          metadata?: Json;
          provider: string;
          refresh_token_ciphertext?: string | null;
          scopes?: string[];
          status?: string;
          tenant_id: string;
          token_expires_at?: string | null;
          updated_at?: string;
        };
        Update: {
          access_token_ciphertext?: string | null;
          connected_at?: string | null;
          connected_by?: string | null;
          created_at?: string;
          external_account_id?: string | null;
          external_account_name?: string | null;
          id?: string;
          last_error?: string | null;
          metadata?: Json;
          provider?: string;
          refresh_token_ciphertext?: string | null;
          scopes?: string[];
          status?: string;
          tenant_id?: string;
          token_expires_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_integrations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_line_knowledge: {
        Row: {
          content: string;
          created_at: string;
          created_by: string | null;
          enabled: boolean;
          id: string;
          tenant_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          id?: string;
          tenant_id: string;
          title?: string;
          updated_at?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          id?: string;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_line_knowledge_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_memberships: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["membership_role_enum"];
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["membership_role_enum"];
          tenant_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["membership_role_enum"];
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_option_subscriptions: {
        Row: {
          cancelled_at: string | null;
          created_at: string;
          current_period_end: string | null;
          id: string;
          option_type: string;
          started_at: string;
          status: string;
          stripe_subscription_id: string | null;
          stripe_subscription_item_id: string | null;
          template_config_id: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          cancelled_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          option_type: string;
          started_at?: string;
          status?: string;
          stripe_subscription_id?: string | null;
          stripe_subscription_item_id?: string | null;
          template_config_id?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          cancelled_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          option_type?: string;
          started_at?: string;
          status?: string;
          stripe_subscription_id?: string | null;
          stripe_subscription_item_id?: string | null;
          template_config_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_option_subscriptions_template_config_id_fkey";
            columns: ["template_config_id"];
            isOneToOne: false;
            referencedRelation: "tenant_template_configs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_option_subscriptions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_private_secrets: {
        Row: {
          created_at: string;
          email_inbound_token_ciphertext: string | null;
          email_inbound_token_hash: string | null;
          email_inbound_token_legacy: string | null;
          external_api_key_hash: string | null;
          external_api_key_last4: string | null;
          external_api_key_legacy: string | null;
          gcal_refresh_token_ciphertext: string | null;
          gcal_refresh_token_legacy: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email_inbound_token_ciphertext?: string | null;
          email_inbound_token_hash?: string | null;
          email_inbound_token_legacy?: string | null;
          external_api_key_hash?: string | null;
          external_api_key_last4?: string | null;
          external_api_key_legacy?: string | null;
          gcal_refresh_token_ciphertext?: string | null;
          gcal_refresh_token_legacy?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email_inbound_token_ciphertext?: string | null;
          email_inbound_token_hash?: string | null;
          email_inbound_token_legacy?: string | null;
          external_api_key_hash?: string | null;
          external_api_key_last4?: string | null;
          external_api_key_legacy?: string | null;
          gcal_refresh_token_ciphertext?: string | null;
          gcal_refresh_token_legacy?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_private_secrets_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_supply_auto_send_settings: {
        Row: {
          enabled: boolean;
          max_order_jpy: number | null;
          monthly_cap_jpy: number | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          enabled?: boolean;
          max_order_jpy?: number | null;
          monthly_cap_jpy?: number | null;
          tenant_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          enabled?: boolean;
          max_order_jpy?: number | null;
          monthly_cap_jpy?: number | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_supply_auto_send_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_supply_links: {
        Row: {
          created_at: string;
          id: string;
          is_enabled: boolean;
          price_overrides: Json | null;
          priority: number;
          supply_partner_id: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_enabled?: boolean;
          price_overrides?: Json | null;
          priority?: number;
          supply_partner_id: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_enabled?: boolean;
          price_overrides?: Json | null;
          priority?: number;
          supply_partner_id?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_supply_links_supply_partner_id_fkey";
            columns: ["supply_partner_id"];
            isOneToOne: false;
            referencedRelation: "supply_partners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_supply_links_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_template_configs: {
        Row: {
          config_json: Json;
          created_at: string;
          id: string;
          is_active: boolean;
          is_default: boolean;
          layout_key: string;
          name: string;
          option_type: string;
          platform_template_id: string | null;
          published_at: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          config_json?: Json;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          layout_key?: string;
          name: string;
          option_type: string;
          platform_template_id?: string | null;
          published_at?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          config_json?: Json;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          layout_key?: string;
          name?: string;
          option_type?: string;
          platform_template_id?: string | null;
          published_at?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_template_configs_platform_template_id_fkey";
            columns: ["platform_template_id"];
            isOneToOne: false;
            referencedRelation: "platform_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_template_configs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_webhooks: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          last_delivery_at: string | null;
          last_delivery_error: string | null;
          last_delivery_status: string | null;
          secret: string;
          tenant_id: string;
          topics: string[];
          updated_at: string;
          url: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          last_delivery_at?: string | null;
          last_delivery_error?: string | null;
          last_delivery_status?: string | null;
          secret: string;
          tenant_id: string;
          topics?: string[];
          updated_at?: string;
          url: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          last_delivery_at?: string | null;
          last_delivery_error?: string | null;
          last_delivery_status?: string | null;
          secret?: string;
          tenant_id?: string;
          topics?: string[];
          updated_at?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_webhooks_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          address: string | null;
          bank_info: Json | null;
          booking_notify_slack_webhook_ciphertext: string | null;
          campaign_slug: string | null;
          cancel_at: string | null;
          cancel_at_period_end: boolean;
          category: string | null;
          company_seal_path: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          created_at: string;
          current_period_end: string | null;
          current_period_start: string | null;
          custom_domain: string | null;
          deactivated_at: string | null;
          default_template_id: string | null;
          default_warranty_exclusions: string | null;
          email_inbound_enabled: boolean;
          gcal_calendar_id: string | null;
          gcal_last_synced_at: string | null;
          gcal_read_calendars: Json;
          gcal_sync_enabled: boolean | null;
          google_review_url: string | null;
          id: string;
          is_active: boolean;
          labor_rate_per_hour: number | null;
          line_channel_access_token_ciphertext: string | null;
          line_channel_id: string | null;
          line_channel_secret_ciphertext: string | null;
          line_channel_token_expires_at: string | null;
          line_enabled: boolean | null;
          line_liff_id: string | null;
          line_link_prompt_enabled: boolean;
          logo_asset_path: string | null;
          name: string;
          plan_tier: Database["public"]["Enums"]["plan_tier_enum"];
          prefecture: string | null;
          registration_number: string | null;
          slug: string;
          square_merchant_id: string | null;
          sso_email_domain: string | null;
          sso_required: boolean;
          stripe_connect_account_id: string | null;
          stripe_connect_onboarded: boolean | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          subscription_status: string | null;
          trial_end: string | null;
          website_url: string | null;
        };
        Insert: {
          address?: string | null;
          bank_info?: Json | null;
          booking_notify_slack_webhook_ciphertext?: string | null;
          campaign_slug?: string | null;
          cancel_at?: string | null;
          cancel_at_period_end?: boolean;
          category?: string | null;
          company_seal_path?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          custom_domain?: string | null;
          deactivated_at?: string | null;
          default_template_id?: string | null;
          default_warranty_exclusions?: string | null;
          email_inbound_enabled?: boolean;
          gcal_calendar_id?: string | null;
          gcal_last_synced_at?: string | null;
          gcal_read_calendars?: Json;
          gcal_sync_enabled?: boolean | null;
          google_review_url?: string | null;
          id?: string;
          is_active?: boolean;
          labor_rate_per_hour?: number | null;
          line_channel_access_token_ciphertext?: string | null;
          line_channel_id?: string | null;
          line_channel_secret_ciphertext?: string | null;
          line_channel_token_expires_at?: string | null;
          line_enabled?: boolean | null;
          line_liff_id?: string | null;
          line_link_prompt_enabled?: boolean;
          logo_asset_path?: string | null;
          name: string;
          plan_tier?: Database["public"]["Enums"]["plan_tier_enum"];
          prefecture?: string | null;
          registration_number?: string | null;
          slug: string;
          square_merchant_id?: string | null;
          sso_email_domain?: string | null;
          sso_required?: boolean;
          stripe_connect_account_id?: string | null;
          stripe_connect_onboarded?: boolean | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          subscription_status?: string | null;
          trial_end?: string | null;
          website_url?: string | null;
        };
        Update: {
          address?: string | null;
          bank_info?: Json | null;
          booking_notify_slack_webhook_ciphertext?: string | null;
          campaign_slug?: string | null;
          cancel_at?: string | null;
          cancel_at_period_end?: boolean;
          category?: string | null;
          company_seal_path?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          custom_domain?: string | null;
          deactivated_at?: string | null;
          default_template_id?: string | null;
          default_warranty_exclusions?: string | null;
          email_inbound_enabled?: boolean;
          gcal_calendar_id?: string | null;
          gcal_last_synced_at?: string | null;
          gcal_read_calendars?: Json;
          gcal_sync_enabled?: boolean | null;
          google_review_url?: string | null;
          id?: string;
          is_active?: boolean;
          labor_rate_per_hour?: number | null;
          line_channel_access_token_ciphertext?: string | null;
          line_channel_id?: string | null;
          line_channel_secret_ciphertext?: string | null;
          line_channel_token_expires_at?: string | null;
          line_enabled?: boolean | null;
          line_liff_id?: string | null;
          line_link_prompt_enabled?: boolean;
          logo_asset_path?: string | null;
          name?: string;
          plan_tier?: Database["public"]["Enums"]["plan_tier_enum"];
          prefecture?: string | null;
          registration_number?: string | null;
          slug?: string;
          square_merchant_id?: string | null;
          sso_email_domain?: string | null;
          sso_required?: boolean;
          stripe_connect_account_id?: string | null;
          stripe_connect_onboarded?: boolean | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          subscription_status?: string | null;
          trial_end?: string | null;
          website_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tenants_default_template_id_fkey";
            columns: ["default_template_id"];
            isOneToOne: false;
            referencedRelation: "document_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      thickness_history_items: {
        Row: {
          created_at: string;
          external_group_id: string;
          group_name: string | null;
          id: string;
          interpretation: number | null;
          material: string | null;
          measured_at: string | null;
          raw_value: string | null;
          tenant_id: string;
          value_um: number | null;
        };
        Insert: {
          created_at?: string;
          external_group_id: string;
          group_name?: string | null;
          id?: string;
          interpretation?: number | null;
          material?: string | null;
          measured_at?: string | null;
          raw_value?: string | null;
          tenant_id: string;
          value_um?: number | null;
        };
        Update: {
          created_at?: string;
          external_group_id?: string;
          group_name?: string | null;
          id?: string;
          interpretation?: number | null;
          material?: string | null;
          measured_at?: string | null;
          raw_value?: string | null;
          tenant_id?: string;
          value_um?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "thickness_history_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      thickness_measurements: {
        Row: {
          created_at: string;
          id: string;
          interpretation: number | null;
          is_inside: boolean;
          material: string | null;
          measured_at: string | null;
          place_id: string;
          position: number | null;
          raw_value: string | null;
          report_id: string;
          section: string;
          tenant_id: string;
          value_um: number | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          interpretation?: number | null;
          is_inside?: boolean;
          material?: string | null;
          measured_at?: string | null;
          place_id: string;
          position?: number | null;
          raw_value?: string | null;
          report_id: string;
          section: string;
          tenant_id: string;
          value_um?: number | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          interpretation?: number | null;
          is_inside?: boolean;
          material?: string | null;
          measured_at?: string | null;
          place_id?: string;
          position?: number | null;
          raw_value?: string | null;
          report_id?: string;
          section?: string;
          tenant_id?: string;
          value_um?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "thickness_measurements_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "thickness_reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "thickness_measurements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      thickness_reports: {
        Row: {
          ai_anomaly_result: Json | null;
          brand: string | null;
          calibration_at: string | null;
          capacity: string | null;
          comment: string | null;
          created_at: string;
          device_serial_number: string | null;
          external_report_id: string;
          extra_fields: Json;
          fuel_type: string | null;
          id: string;
          measured_at: string | null;
          model: string | null;
          name: string | null;
          power: string | null;
          raw_payload: Json | null;
          reservation_id: string | null;
          tenant_id: string;
          type_of_body: string | null;
          unit_of_measure: string | null;
          updated_at: string;
          vehicle_id: string | null;
          vin: string | null;
          year: string | null;
        };
        Insert: {
          ai_anomaly_result?: Json | null;
          brand?: string | null;
          calibration_at?: string | null;
          capacity?: string | null;
          comment?: string | null;
          created_at?: string;
          device_serial_number?: string | null;
          external_report_id: string;
          extra_fields?: Json;
          fuel_type?: string | null;
          id?: string;
          measured_at?: string | null;
          model?: string | null;
          name?: string | null;
          power?: string | null;
          raw_payload?: Json | null;
          reservation_id?: string | null;
          tenant_id: string;
          type_of_body?: string | null;
          unit_of_measure?: string | null;
          updated_at?: string;
          vehicle_id?: string | null;
          vin?: string | null;
          year?: string | null;
        };
        Update: {
          ai_anomaly_result?: Json | null;
          brand?: string | null;
          calibration_at?: string | null;
          capacity?: string | null;
          comment?: string | null;
          created_at?: string;
          device_serial_number?: string | null;
          external_report_id?: string;
          extra_fields?: Json;
          fuel_type?: string | null;
          id?: string;
          measured_at?: string | null;
          model?: string | null;
          name?: string | null;
          power?: string | null;
          raw_payload?: Json | null;
          reservation_id?: string | null;
          tenant_id?: string;
          type_of_body?: string | null;
          unit_of_measure?: string | null;
          updated_at?: string;
          vehicle_id?: string | null;
          vin?: string | null;
          year?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "thickness_reports_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "thickness_reports_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "thickness_reports_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      thickness_tires: {
        Row: {
          created_at: string;
          diameter: string | null;
          id: string;
          maker: string | null;
          profile: string | null;
          report_id: string;
          season: string | null;
          section: string | null;
          tenant_id: string;
          value1: string | null;
          value2: string | null;
          width: string | null;
        };
        Insert: {
          created_at?: string;
          diameter?: string | null;
          id?: string;
          maker?: string | null;
          profile?: string | null;
          report_id: string;
          season?: string | null;
          section?: string | null;
          tenant_id: string;
          value1?: string | null;
          value2?: string | null;
          width?: string | null;
        };
        Update: {
          created_at?: string;
          diameter?: string | null;
          id?: string;
          maker?: string | null;
          profile?: string | null;
          report_id?: string;
          season?: string | null;
          section?: string | null;
          tenant_id?: string;
          value1?: string | null;
          value2?: string | null;
          width?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "thickness_tires_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "thickness_reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "thickness_tires_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tire_storages: {
        Row: {
          brand: string | null;
          created_at: string;
          customer_id: string | null;
          customer_name: string | null;
          id: string;
          notes: string | null;
          quantity: number;
          returned_at: string | null;
          status: string;
          storage_location: string | null;
          stored_at: string;
          swap_month: number | null;
          tenant_id: string;
          tire_size: string | null;
          tire_type: string;
          updated_at: string;
          vehicle_id: string | null;
          vehicle_info: string | null;
        };
        Insert: {
          brand?: string | null;
          created_at?: string;
          customer_id?: string | null;
          customer_name?: string | null;
          id?: string;
          notes?: string | null;
          quantity?: number;
          returned_at?: string | null;
          status?: string;
          storage_location?: string | null;
          stored_at?: string;
          swap_month?: number | null;
          tenant_id: string;
          tire_size?: string | null;
          tire_type?: string;
          updated_at?: string;
          vehicle_id?: string | null;
          vehicle_info?: string | null;
        };
        Update: {
          brand?: string | null;
          created_at?: string;
          customer_id?: string | null;
          customer_name?: string | null;
          id?: string;
          notes?: string | null;
          quantity?: number;
          returned_at?: string | null;
          status?: string;
          storage_location?: string | null;
          stored_at?: string;
          swap_month?: number | null;
          tenant_id?: string;
          tire_size?: string | null;
          tire_type?: string;
          updated_at?: string;
          vehicle_id?: string | null;
          vehicle_info?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tire_storages_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tire_storages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tire_storages_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_feature_prefs: {
        Row: {
          id: string;
          tenant_id: string;
          updated_at: string;
          user_id: string;
          visible_features: Json;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          updated_at?: string;
          user_id: string;
          visible_features?: Json;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          updated_at?: string;
          user_id?: string;
          visible_features?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "user_feature_prefs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      user_interface_preferences: {
        Row: {
          display_mode: string;
          onboarding_completed_at: string | null;
          tenant_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          display_mode?: string;
          onboarding_completed_at?: string | null;
          tenant_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          display_mode?: string;
          onboarding_completed_at?: string | null;
          tenant_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_interface_preferences_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicle_histories: {
        Row: {
          certificate_id: string | null;
          created_at: string;
          description: string | null;
          external_ref: string | null;
          id: string;
          is_public: boolean | null;
          last_synced_at: string | null;
          performed_at: string;
          progress_label: string | null;
          source_system: string | null;
          tenant_id: string;
          title: string;
          type: string;
          updated_at: string;
          vehicle_id: string | null;
        };
        Insert: {
          certificate_id?: string | null;
          created_at?: string;
          description?: string | null;
          external_ref?: string | null;
          id?: string;
          is_public?: boolean | null;
          last_synced_at?: string | null;
          performed_at?: string;
          progress_label?: string | null;
          source_system?: string | null;
          tenant_id: string;
          title: string;
          type: string;
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Update: {
          certificate_id?: string | null;
          created_at?: string;
          description?: string | null;
          external_ref?: string | null;
          id?: string;
          is_public?: boolean | null;
          last_synced_at?: string | null;
          performed_at?: string;
          progress_label?: string | null;
          source_system?: string | null;
          tenant_id?: string;
          title?: string;
          type?: string;
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_histories_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_histories_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_histories_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicle_inspection_findings: {
        Row: {
          certificate_id: string | null;
          created_at: string;
          finding_category: string;
          finding_code: string | null;
          finding_note: string | null;
          finding_severity: string;
          id: string;
          inspected_at: string;
          mileage_km: number | null;
          tenant_id: string;
          vehicle_id: string;
        };
        Insert: {
          certificate_id?: string | null;
          created_at?: string;
          finding_category: string;
          finding_code?: string | null;
          finding_note?: string | null;
          finding_severity?: string;
          id?: string;
          inspected_at: string;
          mileage_km?: number | null;
          tenant_id: string;
          vehicle_id: string;
        };
        Update: {
          certificate_id?: string | null;
          created_at?: string;
          finding_category?: string;
          finding_code?: string | null;
          finding_note?: string | null;
          finding_severity?: string;
          id?: string;
          inspected_at?: string;
          mileage_km?: number | null;
          tenant_id?: string;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_inspection_findings_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_inspection_findings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_inspection_findings_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicle_interests: {
        Row: {
          created_at: string | null;
          customer_email: string | null;
          customer_name: string;
          customer_phone: string | null;
          follow_up_date: string | null;
          id: string;
          interest_level: string;
          note: string | null;
          status: string;
          tenant_id: string;
          updated_at: string | null;
          vehicle_id: string;
        };
        Insert: {
          created_at?: string | null;
          customer_email?: string | null;
          customer_name: string;
          customer_phone?: string | null;
          follow_up_date?: string | null;
          id?: string;
          interest_level?: string;
          note?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string | null;
          vehicle_id: string;
        };
        Update: {
          created_at?: string | null;
          customer_email?: string | null;
          customer_name?: string;
          customer_phone?: string | null;
          follow_up_date?: string | null;
          id?: string;
          interest_level?: string;
          note?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string | null;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_interests_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_interests_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "market_vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicle_mileage_logs: {
        Row: {
          certificate_id: string | null;
          created_at: string;
          id: string;
          mileage_km: number;
          recorded_at: string;
          source: string;
          tenant_id: string;
          vehicle_id: string;
        };
        Insert: {
          certificate_id?: string | null;
          created_at?: string;
          id?: string;
          mileage_km: number;
          recorded_at: string;
          source?: string;
          tenant_id: string;
          vehicle_id: string;
        };
        Update: {
          certificate_id?: string | null;
          created_at?: string;
          id?: string;
          mileage_km?: number;
          recorded_at?: string;
          source?: string;
          tenant_id?: string;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_mileage_logs_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_mileage_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_mileage_logs_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicle_part_replacements: {
        Row: {
          certificate_id: string | null;
          created_at: string;
          id: string;
          mileage_at_replacement: number | null;
          next_replacement_date_est: string | null;
          next_replacement_mileage_est: number | null;
          part_category: string;
          part_installation_id: string | null;
          part_name: string;
          replaced_at: string;
          tenant_id: string;
          vehicle_id: string;
        };
        Insert: {
          certificate_id?: string | null;
          created_at?: string;
          id?: string;
          mileage_at_replacement?: number | null;
          next_replacement_date_est?: string | null;
          next_replacement_mileage_est?: number | null;
          part_category: string;
          part_installation_id?: string | null;
          part_name: string;
          replaced_at: string;
          tenant_id: string;
          vehicle_id: string;
        };
        Update: {
          certificate_id?: string | null;
          created_at?: string;
          id?: string;
          mileage_at_replacement?: number | null;
          next_replacement_date_est?: string | null;
          next_replacement_mileage_est?: number | null;
          part_category?: string;
          part_installation_id?: string | null;
          part_name?: string;
          replaced_at?: string;
          tenant_id?: string;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_part_replacements_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_part_replacements_part_installation_id_fkey";
            columns: ["part_installation_id"];
            isOneToOne: false;
            referencedRelation: "part_installations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_part_replacements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_part_replacements_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicle_passports: {
        Row: {
          anchored_cert_count: number;
          created_at: string;
          current_owner_email: string | null;
          current_owner_name: string | null;
          display_maker: string | null;
          display_model: string | null;
          display_year: number | null;
          first_seen_at: string;
          id: string;
          last_activity_at: string;
          meta_anchor_anchored_at: string | null;
          meta_anchor_cert_count: number | null;
          meta_anchor_hash: string | null;
          meta_anchor_image_count: number | null;
          meta_anchor_network: string | null;
          meta_anchor_tx_hash: string | null;
          ownership_set_at: string | null;
          pii_masked_at: string | null;
          tenant_count: number;
          updated_at: string;
          vin_code_normalized: string;
        };
        Insert: {
          anchored_cert_count?: number;
          created_at?: string;
          current_owner_email?: string | null;
          current_owner_name?: string | null;
          display_maker?: string | null;
          display_model?: string | null;
          display_year?: number | null;
          first_seen_at?: string;
          id?: string;
          last_activity_at?: string;
          meta_anchor_anchored_at?: string | null;
          meta_anchor_cert_count?: number | null;
          meta_anchor_hash?: string | null;
          meta_anchor_image_count?: number | null;
          meta_anchor_network?: string | null;
          meta_anchor_tx_hash?: string | null;
          ownership_set_at?: string | null;
          pii_masked_at?: string | null;
          tenant_count?: number;
          updated_at?: string;
          vin_code_normalized: string;
        };
        Update: {
          anchored_cert_count?: number;
          created_at?: string;
          current_owner_email?: string | null;
          current_owner_name?: string | null;
          display_maker?: string | null;
          display_model?: string | null;
          display_year?: number | null;
          first_seen_at?: string;
          id?: string;
          last_activity_at?: string;
          meta_anchor_anchored_at?: string | null;
          meta_anchor_cert_count?: number | null;
          meta_anchor_hash?: string | null;
          meta_anchor_image_count?: number | null;
          meta_anchor_network?: string | null;
          meta_anchor_tx_hash?: string | null;
          ownership_set_at?: string | null;
          pii_masked_at?: string | null;
          tenant_count?: number;
          updated_at?: string;
          vin_code_normalized?: string;
        };
        Relationships: [];
      };
      vehicle_report_orders: {
        Row: {
          access_token: string;
          amount_jpy: number;
          created_at: string;
          expires_at: string | null;
          id: string;
          paid_at: string | null;
          scope_from: string | null;
          scope_months: number | null;
          scope_type: string;
          source_public_id: string | null;
          status: string;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          tier_key: string | null;
          updated_at: string;
          vin_code_normalized: string;
        };
        Insert: {
          access_token: string;
          amount_jpy: number;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          paid_at?: string | null;
          scope_from?: string | null;
          scope_months?: number | null;
          scope_type?: string;
          source_public_id?: string | null;
          status?: string;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          tier_key?: string | null;
          updated_at?: string;
          vin_code_normalized: string;
        };
        Update: {
          access_token?: string;
          amount_jpy?: number;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          paid_at?: string | null;
          scope_from?: string | null;
          scope_months?: number | null;
          scope_type?: string;
          source_public_id?: string | null;
          status?: string;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          tier_key?: string | null;
          updated_at?: string;
          vin_code_normalized?: string;
        };
        Relationships: [];
      };
      vehicle_report_revenue_shares: {
        Row: {
          amount: number;
          cert_count: number;
          created_at: string;
          currency: string;
          id: string;
          order_id: string;
          paid_at: string | null;
          sale_amount_jpy: number;
          share_bps: number;
          status: string;
          stripe_transfer_id: string | null;
          tenant_id: string;
          total_cert_count: number;
          updated_at: string;
          vin_code_normalized: string;
        };
        Insert: {
          amount: number;
          cert_count: number;
          created_at?: string;
          currency?: string;
          id?: string;
          order_id: string;
          paid_at?: string | null;
          sale_amount_jpy: number;
          share_bps: number;
          status?: string;
          stripe_transfer_id?: string | null;
          tenant_id: string;
          total_cert_count: number;
          updated_at?: string;
          vin_code_normalized: string;
        };
        Update: {
          amount?: number;
          cert_count?: number;
          created_at?: string;
          currency?: string;
          id?: string;
          order_id?: string;
          paid_at?: string | null;
          sale_amount_jpy?: number;
          share_bps?: number;
          status?: string;
          stripe_transfer_id?: string | null;
          tenant_id?: string;
          total_cert_count?: number;
          updated_at?: string;
          vin_code_normalized?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_report_revenue_shares_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "vehicle_report_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicle_report_revenue_shares_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicle_report_settings: {
        Row: {
          enabled: boolean;
          id: number;
          merchant_share_bps: number;
          price_jpy: number;
          updated_at: string;
        };
        Insert: {
          enabled?: boolean;
          id?: number;
          merchant_share_bps?: number;
          price_jpy?: number;
          updated_at?: string;
        };
        Update: {
          enabled?: boolean;
          id?: number;
          merchant_share_bps?: number;
          price_jpy?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      vehicle_report_tiers: {
        Row: {
          created_at: string;
          description: string | null;
          enabled: boolean;
          id: string;
          label: string;
          price_jpy: number;
          scope_months: number | null;
          scope_type: string;
          sort_order: number;
          tier_key: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          enabled?: boolean;
          id?: string;
          label: string;
          price_jpy: number;
          scope_months?: number | null;
          scope_type?: string;
          sort_order?: number;
          tier_key: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          enabled?: boolean;
          id?: string;
          label?: string;
          price_jpy?: number;
          scope_months?: number | null;
          scope_type?: string;
          sort_order?: number;
          tier_key?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vehicle_size_master: {
        Row: {
          body_type: string | null;
          created_at: string;
          full_height_mm: number | null;
          full_length_mm: number | null;
          full_width_mm: number | null;
          id: string;
          maker: string;
          model: string;
          notes: string | null;
          size_class: string;
          volume_m3: number | null;
        };
        Insert: {
          body_type?: string | null;
          created_at?: string;
          full_height_mm?: number | null;
          full_length_mm?: number | null;
          full_width_mm?: number | null;
          id?: string;
          maker: string;
          model: string;
          notes?: string | null;
          size_class: string;
          volume_m3?: number | null;
        };
        Update: {
          body_type?: string | null;
          created_at?: string;
          full_height_mm?: number | null;
          full_length_mm?: number | null;
          full_width_mm?: number | null;
          id?: string;
          maker?: string;
          model?: string;
          notes?: string | null;
          size_class?: string;
          volume_m3?: number | null;
        };
        Relationships: [];
      };
      vehicles: {
        Row: {
          created_at: string;
          customer_id: string | null;
          external_ref: string | null;
          id: string;
          inspection_expiry_date: string | null;
          inspection_reminder_sent_at: string | null;
          last_synced_at: string | null;
          maker: string;
          ml_training_opt_in: boolean;
          model: string;
          notes: string | null;
          passport_opt_out: boolean;
          plate_display: string | null;
          plate_hash: string | null;
          public_id: string;
          size_class: string | null;
          source_system: string | null;
          tenant_id: string;
          updated_at: string;
          vin_code: string | null;
          vin_code_normalized: string | null;
          year: number | null;
        };
        Insert: {
          created_at?: string;
          customer_id?: string | null;
          external_ref?: string | null;
          id?: string;
          inspection_expiry_date?: string | null;
          inspection_reminder_sent_at?: string | null;
          last_synced_at?: string | null;
          maker: string;
          ml_training_opt_in?: boolean;
          model: string;
          notes?: string | null;
          passport_opt_out?: boolean;
          plate_display?: string | null;
          plate_hash?: string | null;
          public_id?: string;
          size_class?: string | null;
          source_system?: string | null;
          tenant_id: string;
          updated_at?: string;
          vin_code?: string | null;
          vin_code_normalized?: string | null;
          year?: number | null;
        };
        Update: {
          created_at?: string;
          customer_id?: string | null;
          external_ref?: string | null;
          id?: string;
          inspection_expiry_date?: string | null;
          inspection_reminder_sent_at?: string | null;
          last_synced_at?: string | null;
          maker?: string;
          ml_training_opt_in?: boolean;
          model?: string;
          notes?: string | null;
          passport_opt_out?: boolean;
          plate_display?: string | null;
          plate_hash?: string | null;
          public_id?: string;
          size_class?: string | null;
          source_system?: string | null;
          tenant_id?: string;
          updated_at?: string;
          vin_code?: string | null;
          vin_code_normalized?: string | null;
          year?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "vehicles_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      webauthn_assertions: {
        Row: {
          authenticator_data: string | null;
          bound_payload_hash: string;
          certificate_id: string | null;
          challenge_id: string | null;
          client_data_json: string | null;
          created_at: string;
          credential_id: string;
          id: string;
          new_counter: number | null;
          operation_type: string;
          signature: string | null;
          tenant_id: string;
          user_id: string;
          user_verified: boolean;
          verified_at: string;
        };
        Insert: {
          authenticator_data?: string | null;
          bound_payload_hash: string;
          certificate_id?: string | null;
          challenge_id?: string | null;
          client_data_json?: string | null;
          created_at?: string;
          credential_id: string;
          id?: string;
          new_counter?: number | null;
          operation_type: string;
          signature?: string | null;
          tenant_id: string;
          user_id: string;
          user_verified: boolean;
          verified_at?: string;
        };
        Update: {
          authenticator_data?: string | null;
          bound_payload_hash?: string;
          certificate_id?: string | null;
          challenge_id?: string | null;
          client_data_json?: string | null;
          created_at?: string;
          credential_id?: string;
          id?: string;
          new_counter?: number | null;
          operation_type?: string;
          signature?: string | null;
          tenant_id?: string;
          user_id?: string;
          user_verified?: boolean;
          verified_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webauthn_assertions_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webauthn_assertions_challenge_id_fkey";
            columns: ["challenge_id"];
            isOneToOne: false;
            referencedRelation: "webauthn_challenges";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webauthn_assertions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      webauthn_challenges: {
        Row: {
          bound_payload_hash: string | null;
          certificate_id: string | null;
          challenge: string;
          consumed_at: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          operation_type: string | null;
          purpose: string;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          bound_payload_hash?: string | null;
          certificate_id?: string | null;
          challenge: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at: string;
          id?: string;
          operation_type?: string | null;
          purpose: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          bound_payload_hash?: string | null;
          certificate_id?: string | null;
          challenge?: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          operation_type?: string | null;
          purpose?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webauthn_challenges_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webauthn_challenges_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_processed_events: {
        Row: {
          created_at: string;
          event_id: string;
          event_type: string | null;
          payload_hash: string | null;
          provider: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          event_type?: string | null;
          payload_hash?: string | null;
          provider: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          event_type?: string | null;
          payload_hash?: string | null;
          provider?: string;
        };
        Relationships: [];
      };
      workflow_templates: {
        Row: {
          created_at: string | null;
          id: string;
          is_default: boolean | null;
          is_platform: boolean | null;
          name: string;
          service_type: string;
          steps: Json;
          tenant_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          is_default?: boolean | null;
          is_platform?: boolean | null;
          name: string;
          service_type: string;
          steps?: Json;
          tenant_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          is_default?: boolean | null;
          is_platform?: boolean | null;
          name?: string;
          service_type?: string;
          steps?: Json;
          tenant_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_templates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      zkp_commitments: {
        Row: {
          claims_snapshot: Json;
          created_at: string;
          id: string;
          installation_id: string;
          leaf_count: number;
          merkle_root: string;
          polygon_anchored_at: string | null;
          polygon_network: string | null;
          polygon_tx_hash: string | null;
          schema_version: string;
          tenant_id: string;
        };
        Insert: {
          claims_snapshot?: Json;
          created_at?: string;
          id?: string;
          installation_id: string;
          leaf_count: number;
          merkle_root: string;
          polygon_anchored_at?: string | null;
          polygon_network?: string | null;
          polygon_tx_hash?: string | null;
          schema_version?: string;
          tenant_id: string;
        };
        Update: {
          claims_snapshot?: Json;
          created_at?: string;
          id?: string;
          installation_id?: string;
          leaf_count?: number;
          merkle_root?: string;
          polygon_anchored_at?: string | null;
          polygon_network?: string | null;
          polygon_tx_hash?: string | null;
          schema_version?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "zkp_commitments_installation_id_fkey";
            columns: ["installation_id"];
            isOneToOne: false;
            referencedRelation: "part_installations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "zkp_commitments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      certificates_public: {
        Row: {
          content_free_text: string | null;
          content_preset_json: Json | null;
          craftsman_name: string | null;
          created_at: string | null;
          current_version: number | null;
          customer_name: string | null;
          expiry_type: Database["public"]["Enums"]["expiry_type_enum"] | null;
          expiry_value: string | null;
          footer_variant: string | null;
          logo_asset_path: string | null;
          public_id: string | null;
          status: Database["public"]["Enums"]["certificate_status_enum"] | null;
          tenant_custom_domain: string | null;
          tenant_name: string | null;
          tenant_slug: string | null;
          vehicle_info_json: Json | null;
        };
        Relationships: [];
      };
      invoices: {
        Row: {
          assigned_user_id: string | null;
          created_at: string | null;
          customer_id: string | null;
          due_date: string | null;
          id: string | null;
          invoice_number: string | null;
          is_invoice_compliant: boolean | null;
          issued_at: string | null;
          items_json: Json | null;
          job_status: string | null;
          note: string | null;
          payment_date: string | null;
          recipient_name: string | null;
          show_bank_info: boolean | null;
          show_logo: boolean | null;
          show_seal: boolean | null;
          status: string | null;
          subtotal: number | null;
          tax: number | null;
          tax_rate: number | null;
          tenant_id: string | null;
          total: number | null;
          updated_at: string | null;
          vehicle_id: string | null;
          vehicle_info_json: Json | null;
        };
        Insert: {
          assigned_user_id?: string | null;
          created_at?: string | null;
          customer_id?: string | null;
          due_date?: string | null;
          id?: string | null;
          invoice_number?: string | null;
          is_invoice_compliant?: boolean | null;
          issued_at?: string | null;
          items_json?: Json | null;
          job_status?: string | null;
          note?: string | null;
          payment_date?: string | null;
          recipient_name?: string | null;
          show_bank_info?: boolean | null;
          show_logo?: boolean | null;
          show_seal?: boolean | null;
          status?: string | null;
          subtotal?: number | null;
          tax?: number | null;
          tax_rate?: number | null;
          tenant_id?: string | null;
          total?: number | null;
          updated_at?: string | null;
          vehicle_id?: string | null;
          vehicle_info_json?: Json | null;
        };
        Update: {
          assigned_user_id?: string | null;
          created_at?: string | null;
          customer_id?: string | null;
          due_date?: string | null;
          id?: string | null;
          invoice_number?: string | null;
          is_invoice_compliant?: boolean | null;
          issued_at?: string | null;
          items_json?: Json | null;
          job_status?: string | null;
          note?: string | null;
          payment_date?: string | null;
          recipient_name?: string | null;
          show_bank_info?: boolean | null;
          show_logo?: boolean | null;
          show_seal?: boolean | null;
          status?: string | null;
          subtotal?: number | null;
          tax?: number | null;
          tax_rate?: number | null;
          tenant_id?: string | null;
          total?: number | null;
          updated_at?: string | null;
          vehicle_id?: string | null;
          vehicle_info_json?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "documents_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
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
      partner_score_view: {
        Row: {
          avg_rating: number | null;
          cancelled_orders: number | null;
          company_name: string | null;
          completed_orders: number | null;
          completion_rate: number | null;
          on_time_rate: number | null;
          rating_count: number | null;
          tenant_id: string | null;
          total_orders: number | null;
          updated_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "partner_scores_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      v_insurer_users_list: {
        Row: {
          created_at: string | null;
          display_name: string | null;
          email: string | null;
          insurer_id: string | null;
          insurer_user_id: string | null;
          is_active: boolean | null;
          last_login_at: string | null;
          role: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          display_name?: string | null;
          email?: never;
          insurer_id?: string | null;
          insurer_user_id?: string | null;
          is_active?: boolean | null;
          last_login_at?: string | null;
          role?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          display_name?: string | null;
          email?: never;
          insurer_id?: string | null;
          insurer_user_id?: string | null;
          is_active?: boolean | null;
          last_login_at?: string | null;
          role?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "insurer_users_insurer_id_fkey";
            columns: ["insurer_id"];
            isOneToOne: false;
            referencedRelation: "insurers";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      acquire_cron_lock: {
        Args: { p_task: string; p_ttl_seconds: number };
        Returns: boolean;
      };
      agent_dashboard_stats: { Args: { p_agent_id: string }; Returns: Json };
      agent_rankings: { Args: { p_period?: string }; Returns: Json };
      analytics_insurer_30days: {
        Args: { p_days?: number; p_insurer_id: string };
        Returns: Json;
      };
      apply_inventory_movement: {
        Args: {
          p_item_id: string;
          p_quantity: number;
          p_reason?: string;
          p_reservation_id?: string;
          p_type: string;
        };
        Returns: Json;
      };
      approve_agent_application: {
        Args: {
          p_application_id: string;
          p_reviewer_id: string;
          p_user_id: string;
        };
        Returns: string;
      };
      auth_uid_by_email: { Args: { p_email: string }; Returns: string };
      billing_analytics_stats: {
        Args: { p_customer_id?: string; p_tenant_id: string };
        Returns: Json;
      };
      calc_size_class_from_volume: { Args: { vol_m3: number }; Returns: string };
      certificate_public_tenant: {
        Args: { p_tenant_id: string };
        Returns: {
          tenant_custom_domain: string;
          tenant_name: string;
          tenant_slug: string;
        }[];
      };
      certificate_vehicle_group_key: {
        Args: { p_vehicle_id: string; p_vehicle_info_json: Json };
        Returns: string;
      };
      check_auth_email_exists: { Args: { p_email: string }; Returns: boolean };
      check_reservation_overlap: {
        Args: {
          p_assigned_user_id?: string;
          p_end_time: string;
          p_exclude_id?: string;
          p_scheduled_date: string;
          p_start_time: string;
          p_tenant_id: string;
        };
        Returns: {
          overlapping_end: string;
          overlapping_id: string;
          overlapping_start: string;
          overlapping_title: string;
        }[];
      };
      claim_outbox_events: {
        Args: { p_batch_size?: number };
        Returns: {
          aggregate_id: string | null;
          attempts: number;
          created_at: string;
          delivered_at: string | null;
          id: string;
          last_error: string | null;
          next_attempt_at: string;
          payload: Json;
          status: string;
          tenant_id: string;
          topic: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "outbox_events";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      claim_reservation_hold: {
        Args: {
          p_end_time: string;
          p_held_by_tenant: string;
          p_job_order_id: string;
          p_scheduled_date: string;
          p_start_time: string;
          p_target_tenant: string;
          p_ttl_minutes?: number;
        };
        Returns: {
          hold_id: string;
          result: string;
        }[];
      };
      cleanup_admin_audit_logs: {
        Args: { p_retention_days?: number };
        Returns: number;
      };
      cleanup_insurer_access_logs: {
        Args: { p_retention_days?: number };
        Returns: number;
      };
      cleanup_insurer_email_verifications: { Args: never; Returns: number };
      consume_photo_capture_nonce: {
        Args: {
          p_certificate_id: string;
          p_device_key_hash: string;
          p_nonce: string;
          p_tenant_id: string;
        };
        Returns: string;
      };
      create_insurer_for_user:
        | {
            Args: {
              p_address?: string;
              p_agency_id?: string;
              p_company_name: string;
              p_contact_person: string;
              p_corporate_number?: string;
              p_email: string;
              p_phone?: string;
              p_referral_code?: string;
              p_representative_name?: string;
              p_requested_plan?: string;
              p_terms_accepted?: boolean;
              p_user_id: string;
            };
            Returns: Json;
          }
        | {
            Args: {
              p_address?: string;
              p_agency_id?: string;
              p_business_type?: string;
              p_company_name: string;
              p_contact_person: string;
              p_corporate_number?: string;
              p_email: string;
              p_phone?: string;
              p_referral_code?: string;
              p_representative_name?: string;
              p_requested_plan?: string;
              p_terms_accepted?: boolean;
              p_user_id: string;
            };
            Returns: Json;
          };
      current_insurer_id: { Args: never; Returns: string };
      current_tenant_id: { Args: never; Returns: string };
      current_uid: { Args: never; Returns: string };
      customer_summary_stats: {
        Args: { p_customer_id: string; p_tenant_id: string };
        Returns: {
          active_certificates: number;
          last_visit: string;
          total_certificates: number;
          total_invoices: number;
          total_spent: number;
          total_vehicles: number;
        }[];
      };
      dashboard_summary_counts: { Args: { p_tenant_id: string }; Returns: Json };
      dashboard_tenant_stats: { Args: { p_tenant_id: string }; Returns: Json };
      dashboard_unpaid_invoice_totals: {
        Args: { p_tenant_id: string };
        Returns: {
          overdue_count: number;
          unpaid_amount: number;
          unpaid_count: number;
        }[];
      };
      estimate_vehicle_size: {
        Args: { p_maker: string; p_model: string };
        Returns: string;
      };
      follow_up_maintenance_months_valid: {
        Args: { arr: number[] };
        Returns: boolean;
      };
      generate_insurer_slug: {
        Args: { p_company_name: string };
        Returns: string;
      };
      generate_public_id: { Args: never; Returns: string };
      generate_vehicle_public_id: { Args: never; Returns: string };
      get_auth_email: { Args: { p_user_id: string }; Returns: string };
      get_auth_email_scoped: { Args: { p_user_id: string }; Returns: string };
      get_auth_emails_by_ids: {
        Args: { p_user_ids: string[] };
        Returns: {
          email: string;
          id: string;
        }[];
      };
      get_certificate_service_price: {
        Args: { cert_id: string };
        Returns: number;
      };
      get_my_agent_status: {
        Args: never;
        Returns: {
          agent_id: string;
          agent_name: string;
          role: string;
          status: string;
        }[];
      };
      get_my_insurer_status: {
        Args: never;
        Returns: {
          insurer_id: string;
          plan_tier: string;
          requested_plan: string;
          status: string;
        }[];
      };
      get_my_user_contexts: { Args: never; Returns: Json };
      get_platform_tenant_id: { Args: never; Returns: string };
      increment_intake_link_usage: {
        Args: { p_id: string };
        Returns: undefined;
      };
      increment_intake_ocr_attempts: {
        Args: { p_id: string };
        Returns: boolean;
      };
      increment_referral_link_click: {
        Args: { p_code: string };
        Returns: undefined;
      };
      insurer_accessible_tenant_ids: {
        Args: { p_insurer_id: string };
        Returns: string[];
      };
      insurer_audit_log: {
        Args: {
          p_action: string;
          p_ip?: string;
          p_query_json?: Json;
          p_target_public_id?: string;
          p_user_agent?: string;
        };
        Returns: undefined;
      };
      insurer_get_certificate: {
        Args: { p_ip?: string; p_public_id: string; p_user_agent?: string };
        Returns: {
          body_repair_json: Json;
          certificate_no: string;
          coating_products_json: Json;
          content_free_text: string;
          content_preset_json: Json;
          created_at: string;
          customer_name: string;
          expiry_type: string;
          expiry_value: string;
          id: string;
          maintenance_json: Json;
          pii_disclosed: boolean;
          ppf_coverage_json: Json;
          public_id: string;
          service_type: string;
          status: string;
          tenant_id: string;
          tenant_name: string;
          updated_at: string;
          vehicle_id: string;
          vehicle_maker: string;
          vehicle_model: string;
          vehicle_plate: string;
          vehicle_vin: string;
          vehicle_year: number;
          warranty_period_end: string;
        }[];
      };
      insurer_get_vehicle_certificates: {
        Args: { p_ip?: string; p_user_agent?: string; p_vehicle_id: string };
        Returns: {
          certificate_id: string;
          certificate_no: string;
          created_at: string;
          customer_name: string;
          public_id: string;
          service_type: string;
          status: string;
        }[];
      };
      insurer_is_active_subscription: {
        Args: { p_insurer_id: string };
        Returns: boolean;
      };
      insurer_search_certificates: {
        Args: {
          p_ip?: string;
          p_limit?: number;
          p_offset?: number;
          p_query?: string;
          p_user_agent?: string;
        };
        Returns: {
          created_at: string;
          customer_name: string;
          image_count: number;
          latest_image_url: string;
          public_id: string;
          service_type: string;
          status: string;
          tenant_id: string;
          tenant_name: string;
          vehicle_id: string;
          vehicle_maker: string;
          vehicle_model: string;
          vehicle_plate: string;
          vehicle_vin: string;
          vehicle_year: number;
        }[];
      };
      insurer_search_stores: {
        Args: {
          p_ip?: string;
          p_limit?: number;
          p_offset?: number;
          p_query?: string;
          p_user_agent?: string;
        };
        Returns: {
          store_address: string;
          store_email: string;
          store_hours: Json;
          store_id: string;
          store_manager: string;
          store_name: string;
          store_phone: string;
          tenant_id: string;
          tenant_name: string;
        }[];
      };
      insurer_search_vehicles:
        | {
            Args: {
              p_ip?: string;
              p_limit?: number;
              p_offset?: number;
              p_query?: string;
              p_user_agent?: string;
            };
            Returns: {
              certificate_count: number;
              latest_cert_created_at: string;
              latest_cert_public_id: string;
              latest_cert_status: string;
              maker: string;
              model: string;
              plate_display: string;
              size_class: string;
              tenant_id: string;
              tenant_name: string;
              vehicle_id: string;
              vin_code: string;
              year: number;
            }[];
          }
        | {
            Args: {
              p_ip?: string;
              p_limit?: number;
              p_offset?: number;
              p_query: string;
              p_status?: string;
              p_user_agent?: string;
            };
            Returns: {
              certificate_count: number;
              latest_active_certificate_public_id: string;
              latest_certificate_public_id: string;
              latest_certificate_status: string;
              latest_certificate_ts: string;
              maker: string;
              model: string;
              plate_display: string;
              search_rank: number;
              vehicle_id: string;
              vehicle_public_id: string;
              year_text: string;
            }[];
          };
      is_agent_admin: { Args: never; Returns: boolean };
      is_approved_dealer: { Args: never; Returns: boolean };
      is_insurer_admin: { Args: never; Returns: boolean };
      is_member_of_tenant: { Args: { p_tenant_id: string }; Returns: boolean };
      is_pii_disclosed: {
        Args: { p_certificate_id: string; p_insurer_id: string };
        Returns: boolean;
      };
      is_super_admin_user: { Args: never; Returns: boolean };
      is_supply_partner_active: { Args: { p_id: string }; Returns: boolean };
      management_kpi_stats: { Args: { p_tenant_id: string }; Returns: Json };
      market_is_approved_dealer: { Args: never; Returns: boolean };
      market_my_dealer_id: { Args: never; Returns: string };
      marketing_churn_stats: { Args: never; Returns: Json };
      match_customer_import_candidates: {
        Args: { p_emails: string[]; p_phones: string[]; p_tenant_id: string };
        Returns: {
          email: string;
          id: string;
          name: string;
          name_kana: string;
          phone: string;
        }[];
      };
      member_role_in_tenant: {
        Args: { p_tenant_id: string };
        Returns: Database["public"]["Enums"]["membership_role_enum"];
      };
      monitor_heavy_insurer_access: {
        Args: { p_since: string; p_threshold?: number };
        Returns: {
          access_count: number;
          insurer_id: string;
        }[];
      };
      my_agent_ids: { Args: never; Returns: string[] };
      my_dealer_id: { Args: never; Returns: string };
      my_insurer_ids: { Args: never; Returns: string[] };
      my_manufacturer_ids: { Args: never; Returns: string[] };
      my_org_ids: { Args: never; Returns: string[] };
      my_org_tenant_ids: { Args: never; Returns: string[] };
      my_supply_partner_ids: { Args: never; Returns: string[] };
      my_tenant_ids: { Args: never; Returns: string[] };
      my_tenant_role: { Args: { p_tenant_id: string }; Returns: string };
      norm_vehicle_plate: { Args: { p_text: string }; Returns: string };
      norm_vehicle_text: { Args: { p_text: string }; Returns: string };
      norm_vehicle_year: { Args: { p_text: string }; Returns: string };
      normalize_plate_search: { Args: { src: string }; Returns: string };
      part_assurance_rank: { Args: { level: string }; Returns: number };
      part_meets_required_assurance: {
        Args: { actual: string; required: string };
        Returns: boolean;
      };
      part_register_serial: {
        Args: {
          p_fingerprint: string;
          p_installation_id: string;
          p_tenant_id: string;
        };
        Returns: string;
      };
      part_verify_otp: {
        Args: {
          p_code_hash: string;
          p_ip: string;
          p_max_attempts: number;
          p_tenant_id: string;
          p_token: string;
          p_user_agent: string;
        };
        Returns: string;
      };
      platform_agent_count: { Args: never; Returns: number };
      platform_certificate_stats: { Args: never; Returns: Json };
      platform_insurer_count: { Args: never; Returns: number };
      platform_regional_stats: { Args: never; Returns: Json };
      platform_tenant_category_stats: { Args: never; Returns: Json };
      pos_checkout: {
        Args: {
          p_amount?: number;
          p_create_receipt?: boolean;
          p_customer_id?: string;
          p_items_json?: Json;
          p_note?: string;
          p_payment_method?: string;
          p_received_amount?: number;
          p_register_session_id?: string;
          p_reservation_id?: string;
          p_store_id?: string;
          p_tax_rate?: number;
          p_tenant_id: string;
          p_user_id?: string;
        };
        Returns: Json;
      };
      pos_daily_sales_totals: {
        Args: { p_day_end: string; p_day_start: string; p_tenant_id: string };
        Returns: {
          cnt: number;
          payment_method: string;
          total: number;
        }[];
      };
      pricing_elasticity_stats: {
        Args: { p_since?: string; p_tenant_id: string };
        Returns: {
          avg_estimated_amount: number;
          cancelled_count: number;
          completed_count: number;
          max_estimated_amount: number;
          min_estimated_amount: number;
          period_month: string;
          reservation_count: number;
          title: string;
          total_completed_revenue: number;
        }[];
      };
      refresh_partner_score: {
        Args: { p_tenant_id: string };
        Returns: undefined;
      };
      register_insurer_v2:
        | {
            Args: {
              p_address?: string;
              p_company_name: string;
              p_contact_person: string;
              p_corporate_number?: string;
              p_email: string;
              p_password: string;
              p_phone?: string;
              p_representative_name?: string;
              p_requested_plan?: string;
              p_terms_accepted?: boolean;
            };
            Returns: Json;
          }
        | {
            Args: {
              p_address?: string;
              p_agency_id?: string;
              p_company_name: string;
              p_contact_person: string;
              p_corporate_number?: string;
              p_email: string;
              p_password: string;
              p_phone?: string;
              p_referral_code?: string;
              p_representative_name?: string;
              p_requested_plan?: string;
              p_terms_accepted?: boolean;
            };
            Returns: Json;
          };
      release_cron_lock: { Args: { p_task: string }; Returns: undefined };
      replace_staff_shifts: {
        Args: { p_shifts: Json; p_staff_id: string };
        Returns: undefined;
      };
      resolve_vehicle_representative_certificate_public_id: {
        Args: {
          p_context: string;
          p_latest_active_certificate_public_id: string;
          p_latest_certificate_public_id: string;
        };
        Returns: string;
      };
      search_vehicles_for_cartrust:
        | {
            Args: { p_limit?: number; p_offset?: number; p_query: string };
            Returns: {
              certificate_count: number;
              latest_active_certificate_public_id: string;
              latest_certificate_public_id: string;
              latest_certificate_status: string;
              latest_certificate_ts: string;
              maker: string;
              model: string;
              plate_display: string;
              search_rank: number;
              vehicle_id: string;
              vehicle_public_id: string;
              year_text: string;
            }[];
          }
        | {
            Args: {
              p_limit?: number;
              p_offset?: number;
              p_query: string;
              p_status?: string;
            };
            Returns: {
              certificate_count: number;
              latest_active_certificate_public_id: string;
              latest_certificate_public_id: string;
              latest_certificate_status: string;
              latest_certificate_ts: string;
              maker: string;
              model: string;
              plate_display: string;
              search_rank: number;
              vehicle_id: string;
              vehicle_public_id: string;
              year_text: string;
            }[];
          };
      staff_performance_stats: {
        Args: { p_since?: string; p_tenant_id: string };
        Returns: {
          avg_authenticity_grade: number;
          avg_review_rating: number;
          avg_work_minutes: number;
          cert_anchored_count: number;
          cert_count: number;
          distinct_customers: number;
          reservations_cancelled: number;
          reservations_completed: number;
          returning_customers: number;
          review_count: number;
          user_id: string;
        }[];
      };
      staff_roster_stats: {
        Args: { p_since?: string; p_tenant_id: string };
        Returns: {
          assignments_total: number;
          avg_work_minutes: number;
          cancelled: number;
          completed: number;
          staff_id: string;
        }[];
      };
      tenant_caller_has_role: {
        Args: { p_roles: string[]; p_tenant: string };
        Returns: boolean;
      };
      upsert_agent_user: {
        Args: {
          p_agent_id: string;
          p_display_name?: string;
          p_email: string;
          p_role?: string;
        };
        Returns: string;
      };
      upsert_insurer_user: {
        Args: {
          p_display_name?: string;
          p_email: string;
          p_insurer_id: string;
          p_role?: string;
        };
        Returns: string;
      };
      vehicle_group_key_from_fields: {
        Args: {
          p_fallback_id: string;
          p_maker: string;
          p_model: string;
          p_plate: string;
          p_vehicle_id: string;
          p_year: string;
        };
        Returns: string;
      };
      vin_normalize: { Args: { raw: string }; Returns: string };
      withdraw_insurer: { Args: { p_insurer_id: string }; Returns: Json };
    };
    Enums: {
      certificate_status_enum: "active" | "void" | "draft";
      expiry_type_enum: "date" | "maintenance" | "text";
      membership_role_enum: "owner" | "admin" | "staff" | "super_admin" | "viewer";
      plan_tier_enum: "mini" | "standard" | "pro" | "free" | "starter";
      template_scope_enum: "shared" | "tenant";
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
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
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
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
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
      certificate_status_enum: ["active", "void", "draft"],
      expiry_type_enum: ["date", "maintenance", "text"],
      membership_role_enum: ["owner", "admin", "staff", "super_admin", "viewer"],
      plan_tier_enum: ["mini", "standard", "pro", "free", "starter"],
      template_scope_enum: ["shared", "tenant"],
    },
  },
} as const;

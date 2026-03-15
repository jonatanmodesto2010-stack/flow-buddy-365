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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agreement_installments: {
        Row: {
          agreement_id: string
          created_at: string | null
          due_date: string
          id: string
          installment_number: number
          paid_at: string | null
          status: string
          value: number
        }
        Insert: {
          agreement_id: string
          created_at?: string | null
          due_date: string
          id?: string
          installment_number: number
          paid_at?: string | null
          status?: string
          value: number
        }
        Update: {
          agreement_id?: string
          created_at?: string | null
          due_date?: string
          id?: string
          installment_number?: number
          paid_at?: string | null
          status?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "agreement_installments_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "client_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      app_versions: {
        Row: {
          build_time: string
          build_version: string
          created_at: string | null
          deployed_at: string | null
          id: string
          is_active: boolean | null
          version: string
        }
        Insert: {
          build_time: string
          build_version: string
          created_at?: string | null
          deployed_at?: string | null
          id?: string
          is_active?: boolean | null
          version: string
        }
        Update: {
          build_time?: string
          build_version?: string
          created_at?: string | null
          deployed_at?: string | null
          id?: string
          is_active?: boolean | null
          version?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          organization_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          organization_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          organization_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_agreements: {
        Row: {
          agreed_value: number
          created_at: string | null
          created_by: string | null
          discount_percent: number | null
          id: string
          installments_count: number
          notes: string | null
          organization_id: string
          original_debt: number
          status: string
          timeline_id: string
          updated_at: string | null
        }
        Insert: {
          agreed_value: number
          created_at?: string | null
          created_by?: string | null
          discount_percent?: number | null
          id?: string
          installments_count?: number
          notes?: string | null
          organization_id: string
          original_debt: number
          status?: string
          timeline_id: string
          updated_at?: string | null
        }
        Update: {
          agreed_value?: number
          created_at?: string | null
          created_by?: string | null
          discount_percent?: number | null
          id?: string
          installments_count?: number
          notes?: string | null
          organization_id?: string
          original_debt?: number
          status?: string
          timeline_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_agreements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_agreements_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "client_timelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_agreements_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "unique_client_timelines"
            referencedColumns: ["id"]
          },
        ]
      }
      client_analysis_history: {
        Row: {
          analysis_data: Json
          created_at: string | null
          id: string
          risk_level: string
          risk_score: number
          timeline_id: string
        }
        Insert: {
          analysis_data: Json
          created_at?: string | null
          id?: string
          risk_level: string
          risk_score: number
          timeline_id: string
        }
        Update: {
          analysis_data?: Json
          created_at?: string | null
          id?: string
          risk_level?: string
          risk_score?: number
          timeline_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_analysis_history_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "client_timelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_analysis_history_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "unique_client_timelines"
            referencedColumns: ["id"]
          },
        ]
      }
      client_boletos: {
        Row: {
          boleto_value: number
          boleto_value_open: number | null
          created_at: string | null
          description: string | null
          due_date: string
          id: string
          ixc_boleto_id: string | null
          status: string
          timeline_id: string
          updated_at: string | null
        }
        Insert: {
          boleto_value: number
          boleto_value_open?: number | null
          created_at?: string | null
          description?: string | null
          due_date: string
          id?: string
          ixc_boleto_id?: string | null
          status?: string
          timeline_id: string
          updated_at?: string | null
        }
        Update: {
          boleto_value?: number
          boleto_value_open?: number | null
          created_at?: string | null
          description?: string | null
          due_date?: string
          id?: string
          ixc_boleto_id?: string | null
          status?: string
          timeline_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_boletos_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "client_timelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_boletos_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "unique_client_timelines"
            referencedColumns: ["id"]
          },
        ]
      }
      client_timeline_tags: {
        Row: {
          created_at: string | null
          id: string
          tag_id: string
          timeline_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          tag_id: string
          timeline_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          tag_id?: string
          timeline_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_timeline_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_timeline_tags_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "client_timelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_timeline_tags_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "unique_client_timelines"
            referencedColumns: ["id"]
          },
        ]
      }
      client_timelines: {
        Row: {
          boleto_value: number | null
          client_id: string | null
          client_name: string
          completed_at: string | null
          completion_notes: string | null
          created_at: string | null
          due_date: string | null
          id: string
          is_active: boolean
          ixc_filial_id: string | null
          ixc_filial_name: string | null
          organization_id: string | null
          start_date: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          boleto_value?: number | null
          client_id?: string | null
          client_name: string
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          is_active?: boolean
          ixc_filial_id?: string | null
          ixc_filial_name?: string | null
          organization_id?: string | null
          start_date: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          boleto_value?: number | null
          client_id?: string | null
          client_name?: string
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          is_active?: boolean
          ixc_filial_id?: string | null
          ixc_filial_name?: string | null
          organization_id?: string | null
          start_date?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_timelines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_timelines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_actions: {
        Row: {
          action_date: string
          action_type: string
          boleto_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          id: string
          message: string | null
          organization_id: string
          rule_id: string | null
          status: string
          timeline_id: string
        }
        Insert: {
          action_date: string
          action_type: string
          boleto_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          organization_id: string
          rule_id?: string | null
          status?: string
          timeline_id: string
        }
        Update: {
          action_date?: string
          action_type?: string
          boleto_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          organization_id?: string
          rule_id?: string | null
          status?: string
          timeline_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_actions_boleto_id_fkey"
            columns: ["boleto_id"]
            isOneToOne: false
            referencedRelation: "client_boletos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_actions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "collection_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_actions_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "client_timelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_actions_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "unique_client_timelines"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_rules: {
        Row: {
          action_type: string
          created_at: string | null
          id: string
          is_active: boolean
          message_template: string | null
          name: string
          organization_id: string
          sort_order: number
          trigger_days: number
          updated_at: string | null
        }
        Insert: {
          action_type?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          message_template?: string | null
          name: string
          organization_id: string
          sort_order?: number
          trigger_days: number
          updated_at?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          message_template?: string | null
          name?: string
          organization_id?: string
          sort_order?: number
          trigger_days?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync_log: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          organization_id: string
          records_created: number | null
          records_processed: number | null
          records_updated: number | null
          started_at: string | null
          status: string
          sync_metadata: Json | null
          sync_type: string
          total_records: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          organization_id: string
          records_created?: number | null
          records_processed?: number | null
          records_updated?: number | null
          started_at?: string | null
          status?: string
          sync_metadata?: Json | null
          sync_type: string
          total_records?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          organization_id?: string
          records_created?: number | null
          records_processed?: number | null
          records_updated?: number | null
          started_at?: string | null
          status?: string
          sync_metadata?: Json | null
          sync_type?: string
          total_records?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string | null
          discount_amount: number | null
          due_date: string
          final_amount: number
          gateway_invoice_id: string | null
          gateway_payment_url: string | null
          id: string
          notes: string | null
          organization_id: string
          paid_at: string | null
          reference_month: string | null
          status: string
          subscription_id: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          discount_amount?: number | null
          due_date: string
          final_amount: number
          gateway_invoice_id?: string | null
          gateway_payment_url?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          paid_at?: string | null
          reference_month?: string | null
          status?: string
          subscription_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          discount_amount?: number | null
          due_date?: string
          final_amount?: number
          gateway_invoice_id?: string | null
          gateway_payment_url?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          paid_at?: string | null
          reference_month?: string | null
          status?: string
          subscription_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "organization_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_filters: {
        Row: {
          filter_data: Json
          id: string
          organization_id: string
          page_name: string
          updated_at: string | null
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          filter_data?: Json
          id?: string
          organization_id: string
          page_name: string
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          filter_data?: Json
          id?: string
          organization_id?: string
          page_name?: string
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_filters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_icons: {
        Row: {
          created_at: string | null
          created_by: string | null
          icon: string
          id: string
          label: string | null
          organization_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          icon: string
          id?: string
          label?: string | null
          organization_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          icon?: string
          id?: string
          label?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_icons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_integrations: {
        Row: {
          api_token: string | null
          api_url: string | null
          api_url_contracts: string | null
          created_at: string | null
          id: string
          integration_type: string
          is_active: boolean
          ixc_os_retirada_assunto_id: string | null
          last_boleto_sync_at: string | null
          last_sync_at: string | null
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          api_token?: string | null
          api_url?: string | null
          api_url_contracts?: string | null
          created_at?: string | null
          id?: string
          integration_type?: string
          is_active?: boolean
          ixc_os_retirada_assunto_id?: string | null
          last_boleto_sync_at?: string | null
          last_sync_at?: string | null
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          api_token?: string | null
          api_url?: string | null
          api_url_contracts?: string | null
          created_at?: string | null
          id?: string
          integration_type?: string
          is_active?: boolean
          ixc_os_retirada_assunto_id?: string | null
          last_boleto_sync_at?: string | null
          last_sync_at?: string | null
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscriptions: {
        Row: {
          canceled_at: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          discount_percent: number | null
          gateway_customer_id: string | null
          gateway_subscription_id: string | null
          id: string
          monthly_price: number
          notes: string | null
          organization_id: string
          payment_gateway: string | null
          plan_id: string
          status: string
          suspended_at: string | null
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          discount_percent?: number | null
          gateway_customer_id?: string | null
          gateway_subscription_id?: string | null
          id?: string
          monthly_price?: number
          notes?: string | null
          organization_id: string
          payment_gateway?: string | null
          plan_id: string
          status?: string
          suspended_at?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          discount_percent?: number | null
          gateway_customer_id?: string | null
          gateway_subscription_id?: string | null
          id?: string
          monthly_price?: number
          notes?: string | null
          organization_id?: string
          payment_gateway?: string | null
          plan_id?: string
          status?: string
          suspended_at?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          custom_domain: string | null
          events_per_line_limit: number
          id: string
          logo_url: string | null
          max_clients: number
          max_users: number
          name: string
          plan: string
          primary_color: string | null
          status: string
          subscription_expires_at: string | null
          suspended_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          custom_domain?: string | null
          events_per_line_limit?: number
          id?: string
          logo_url?: string | null
          max_clients?: number
          max_users?: number
          name: string
          plan?: string
          primary_color?: string | null
          status?: string
          subscription_expires_at?: string | null
          suspended_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          custom_domain?: string | null
          events_per_line_limit?: number
          id?: string
          logo_url?: string | null
          max_clients?: number
          max_users?: number
          name?: string
          plan?: string
          primary_color?: string | null
          status?: string
          subscription_expires_at?: string | null
          suspended_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          gateway_transaction_id: string | null
          id: string
          invoice_id: string
          notes: string | null
          organization_id: string
          paid_at: string
          payment_gateway: string | null
          payment_method: string
          status: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          gateway_transaction_id?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          organization_id: string
          paid_at?: string
          payment_gateway?: string | null
          payment_method?: string
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          gateway_transaction_id?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          organization_id?: string
          paid_at?: string
          payment_gateway?: string | null
          payment_method?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string | null
          description: string | null
          features: Json | null
          id: string
          is_active: boolean
          max_clients: number
          max_users: number
          monthly_price: number
          name: string
          slug: string
          sort_order: number
          trial_days: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean
          max_clients?: number
          max_users?: number
          monthly_price?: number
          name: string
          slug: string
          sort_order?: number
          trial_days?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean
          max_clients?: number
          max_users?: number
          monthly_price?: number
          name?: string
          slug?: string
          sort_order?: number
          trial_days?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
          organization_id: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id: string
          organization_id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          organization_id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      system_changelog: {
        Row: {
          change_type: string
          created_at: string | null
          details: string | null
          environment: string | null
          error_notes: string | null
          expected_impact: string | null
          files_changed: string[] | null
          id: string
          is_rollback: boolean | null
          module: string
          organization_id: string
          result: string | null
          risk_level: string | null
          rollback_of: string | null
          status: string | null
          summary: string
          updated_at: string | null
          user_id: string | null
          version: string | null
        }
        Insert: {
          change_type: string
          created_at?: string | null
          details?: string | null
          environment?: string | null
          error_notes?: string | null
          expected_impact?: string | null
          files_changed?: string[] | null
          id?: string
          is_rollback?: boolean | null
          module: string
          organization_id: string
          result?: string | null
          risk_level?: string | null
          rollback_of?: string | null
          status?: string | null
          summary: string
          updated_at?: string | null
          user_id?: string | null
          version?: string | null
        }
        Update: {
          change_type?: string
          created_at?: string | null
          details?: string | null
          environment?: string | null
          error_notes?: string | null
          expected_impact?: string | null
          files_changed?: string[] | null
          id?: string
          is_rollback?: boolean | null
          module?: string
          organization_id?: string
          result?: string | null
          risk_level?: string | null
          rollback_of?: string | null
          status?: string | null
          summary?: string
          updated_at?: string | null
          user_id?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_changelog_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_changelog_rollback_of_fkey"
            columns: ["rollback_of"]
            isOneToOne: false
            referencedRelation: "system_changelog"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          created_at: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          color?: string
          created_at?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          color?: string
          created_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          created_at: string | null
          description: string | null
          event_date: string
          event_order: number
          event_time: string | null
          icon: string
          icon_size: string
          id: string
          ixc_alert_line: string | null
          line_id: string
          position: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          event_date: string
          event_order?: number
          event_time?: string | null
          icon?: string
          icon_size?: string
          id?: string
          ixc_alert_line?: string | null
          line_id: string
          position: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          event_date?: string
          event_order?: number
          event_time?: string | null
          icon?: string
          icon_size?: string
          id?: string
          ixc_alert_line?: string | null
          line_id?: string
          position?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "timeline_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_lines: {
        Row: {
          created_at: string | null
          id: string
          position: number
          timeline_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          position?: number
          timeline_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          position?: number
          timeline_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_lines_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "client_timelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_lines_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "unique_client_timelines"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          id: string
          preference_key: string
          preference_value: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          preference_key: string
          preference_value: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          preference_key?: string
          preference_value?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      latest_client_events: {
        Row: {
          description: string | null
          event_date: string | null
          icon: string | null
          timeline_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timeline_lines_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "client_timelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_lines_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "unique_client_timelines"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_integrations_public: {
        Row: {
          created_at: string | null
          id: string | null
          integration_type: string | null
          is_active: boolean | null
          ixc_os_retirada_assunto_id: string | null
          last_boleto_sync_at: string | null
          last_sync_at: string | null
          organization_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          integration_type?: string | null
          is_active?: boolean | null
          ixc_os_retirada_assunto_id?: string | null
          last_boleto_sync_at?: string | null
          last_sync_at?: string | null
          organization_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          integration_type?: string | null
          is_active?: boolean | null
          ixc_os_retirada_assunto_id?: string | null
          last_boleto_sync_at?: string | null
          last_sync_at?: string | null
          organization_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      unique_client_timelines: {
        Row: {
          boleto_value: number | null
          client_id: string | null
          client_name: string | null
          completed_at: string | null
          completion_notes: string | null
          created_at: string | null
          due_date: string | null
          id: string | null
          is_active: boolean | null
          ixc_filial_id: string | null
          ixc_filial_name: string | null
          organization_id: string | null
          start_date: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_timelines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_timelines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_user_to_organization: {
        Args: {
          _organization_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      batch_upsert_boletos:
        | {
            Args: {
              p_dates: string[]
              p_ids: string[]
              p_statuses: string[]
              p_values: number[]
            }
            Returns: undefined
          }
        | {
            Args: {
              p_dates: string[]
              p_ids: string[]
              p_statuses: string[]
              p_values: number[]
              p_values_open?: number[]
            }
            Returns: undefined
          }
      batch_upsert_clients:
        | {
            Args: {
              p_active: boolean[]
              p_ids: string[]
              p_names: string[]
              p_statuses: string[]
            }
            Returns: undefined
          }
        | {
            Args: {
              p_active: boolean[]
              p_filial_ids?: string[]
              p_filial_names?: string[]
              p_ids: string[]
              p_names: string[]
              p_statuses: string[]
            }
            Returns: undefined
          }
      check_org_client_limit: { Args: { _org_id: string }; Returns: boolean }
      check_org_user_limit: { Args: { _org_id: string }; Returns: boolean }
      generate_client_sequential_id: {
        Args: { org_id: string }
        Returns: string
      }
      get_organization_stats: {
        Args: { _org_id: string }
        Returns: {
          total_active_clients: number
          total_clients: number
          total_users: number
        }[]
      }
      get_organization_users: {
        Args: { _org_id: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          phone: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          user_role_id: string
        }[]
      }
      get_user_id_by_email: { Args: { _email: string }; Returns: string }
      get_user_organization: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      user_in_organization: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "member" | "viewer"
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
  public: {
    Enums: {
      app_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const

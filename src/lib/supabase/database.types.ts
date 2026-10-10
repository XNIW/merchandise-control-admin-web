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
      audit_logs: {
        Row: {
          actor_profile_id: string | null
          actor_staff_id: string | null
          audit_log_id: string
          created_at: string
          event_key: string
          metadata_redacted: Json
          result: string
          scope: string
          severity: string
          shop_id: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          actor_profile_id?: string | null
          actor_staff_id?: string | null
          audit_log_id?: string
          created_at?: string
          event_key: string
          metadata_redacted?: Json
          result?: string
          scope: string
          severity?: string
          shop_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          actor_profile_id?: string | null
          actor_staff_id?: string | null
          audit_log_id?: string
          created_at?: string
          event_key?: string
          metadata_redacted?: Json
          result?: string
          scope?: string
          severity?: string
          shop_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "audit_logs_actor_staff_id_fkey"
            columns: ["actor_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "audit_logs_actor_staff_id_fkey"
            columns: ["actor_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts_safe"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "audit_logs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      backup_task108_inventory_categories_20260514173049: {
        Row: {
          deleted_at: string | null
          id: string | null
          name: string | null
          owner_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          deleted_at?: string | null
          id?: string | null
          name?: string | null
          owner_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          deleted_at?: string | null
          id?: string | null
          name?: string | null
          owner_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      backup_task108_inventory_product_prices_20260514173049: {
        Row: {
          created_at: string | null
          effective_at: string | null
          id: string | null
          note: string | null
          owner_user_id: string | null
          price: number | null
          product_id: string | null
          source: string | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          effective_at?: string | null
          id?: string | null
          note?: string | null
          owner_user_id?: string | null
          price?: number | null
          product_id?: string | null
          source?: string | null
          type?: string | null
        }
        Update: {
          created_at?: string | null
          effective_at?: string | null
          id?: string | null
          note?: string | null
          owner_user_id?: string | null
          price?: number | null
          product_id?: string | null
          source?: string | null
          type?: string | null
        }
        Relationships: []
      }
      backup_task108_inventory_products_20260514173049: {
        Row: {
          barcode: string | null
          category_id: string | null
          deleted_at: string | null
          id: string | null
          item_number: string | null
          owner_user_id: string | null
          product_name: string | null
          purchase_price: number | null
          retail_price: number | null
          second_product_name: string | null
          stock_quantity: number | null
          supplier_id: string | null
          updated_at: string | null
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          deleted_at?: string | null
          id?: string | null
          item_number?: string | null
          owner_user_id?: string | null
          product_name?: string | null
          purchase_price?: number | null
          retail_price?: number | null
          second_product_name?: string | null
          stock_quantity?: number | null
          supplier_id?: string | null
          updated_at?: string | null
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          deleted_at?: string | null
          id?: string | null
          item_number?: string | null
          owner_user_id?: string | null
          product_name?: string | null
          purchase_price?: number | null
          retail_price?: number | null
          second_product_name?: string | null
          stock_quantity?: number | null
          supplier_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      backup_task108_inventory_suppliers_20260514173049: {
        Row: {
          deleted_at: string | null
          id: string | null
          name: string | null
          owner_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          deleted_at?: string | null
          id?: string | null
          name?: string | null
          owner_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          deleted_at?: string | null
          id?: string | null
          name?: string | null
          owner_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      backup_task108_shared_sheet_sessions_20260514173049: {
        Row: {
          category: string | null
          data: Json | null
          display_name: string | null
          is_manual_entry: boolean | null
          owner_user_id: string | null
          payload_version: number | null
          remote_id: string | null
          session_overlay: Json | null
          supplier: string | null
          timestamp: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          data?: Json | null
          display_name?: string | null
          is_manual_entry?: boolean | null
          owner_user_id?: string | null
          payload_version?: number | null
          remote_id?: string | null
          session_overlay?: Json | null
          supplier?: string | null
          timestamp?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          data?: Json | null
          display_name?: string | null
          is_manual_entry?: boolean | null
          owner_user_id?: string | null
          payload_version?: number | null
          remote_id?: string | null
          session_overlay?: Json | null
          supplier?: string | null
          timestamp?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      backup_task108_sync_events_20260514173049: {
        Row: {
          batch_id: string | null
          changed_count: number | null
          client_event_id: string | null
          created_at: string | null
          domain: string | null
          entity_ids: Json | null
          event_type: string | null
          expires_at: string | null
          id: number | null
          metadata: Json | null
          owner_user_id: string | null
          source: string | null
          source_device_id: string | null
          store_id: string | null
        }
        Insert: {
          batch_id?: string | null
          changed_count?: number | null
          client_event_id?: string | null
          created_at?: string | null
          domain?: string | null
          entity_ids?: Json | null
          event_type?: string | null
          expires_at?: string | null
          id?: number | null
          metadata?: Json | null
          owner_user_id?: string | null
          source?: string | null
          source_device_id?: string | null
          store_id?: string | null
        }
        Update: {
          batch_id?: string | null
          changed_count?: number | null
          client_event_id?: string | null
          created_at?: string | null
          domain?: string | null
          entity_ids?: Json | null
          event_type?: string | null
          expires_at?: string | null
          id?: number | null
          metadata?: Json | null
          owner_user_id?: string | null
          source?: string | null
          source_device_id?: string | null
          store_id?: string | null
        }
        Relationships: []
      }
      inventory_categories: {
        Row: {
          deleted_at: string | null
          id: string
          name: string
          owner_user_id: string
          shop_id: string | null
          updated_at: string
        }
        Insert: {
          deleted_at?: string | null
          id?: string
          name: string
          owner_user_id: string
          shop_id?: string | null
          updated_at?: string
        }
        Update: {
          deleted_at?: string | null
          id?: string
          name?: string
          owner_user_id?: string
          shop_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_categories_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      inventory_product_image_versions: {
        Row: {
          actor_kind: string
          cleanup_attempts: number
          cleanup_last_error_code: string | null
          cleanup_status: string
          cleanup_updated_at: string | null
          created_at: string
          expected_main_bytes: number
          expected_main_height: number
          expected_main_mime_type: string
          expected_main_sha256: string
          expected_main_width: number
          expected_thumb_bytes: number
          expected_thumb_height: number
          expected_thumb_mime_type: string
          expected_thumb_sha256: string
          expected_thumb_width: number
          expires_at: string
          finalized_at: string | null
          finalized_by_pos_session_id: string | null
          finalized_by_profile_id: string | null
          finalized_by_shop_device_id: string | null
          finalized_by_staff_id: string | null
          id: string
          main_path: string
          previous_version_id: string | null
          pos_upload_capability_expires_at: string | null
          product_id: string
          removed_at: string | null
          requested_by_pos_session_id: string | null
          requested_by_profile_id: string | null
          requested_by_shop_device_id: string | null
          requested_by_staff_id: string | null
          shop_id: string
          status: string
          superseded_at: string | null
          thumb_path: string
          verified_main_bytes: number | null
          verified_main_height: number | null
          verified_main_mime_type: string | null
          verified_main_sha256: string | null
          verified_main_width: number | null
          verified_thumb_bytes: number | null
          verified_thumb_height: number | null
          verified_thumb_mime_type: string | null
          verified_thumb_sha256: string | null
          verified_thumb_width: number | null
        }
        Insert: {
          actor_kind: string
          cleanup_attempts?: number
          cleanup_last_error_code?: string | null
          cleanup_status?: string
          cleanup_updated_at?: string | null
          created_at?: string
          expected_main_bytes: number
          expected_main_height: number
          expected_main_mime_type?: string
          expected_main_sha256: string
          expected_main_width: number
          expected_thumb_bytes: number
          expected_thumb_height: number
          expected_thumb_mime_type?: string
          expected_thumb_sha256: string
          expected_thumb_width: number
          expires_at?: string
          finalized_at?: string | null
          finalized_by_pos_session_id?: string | null
          finalized_by_profile_id?: string | null
          finalized_by_shop_device_id?: string | null
          finalized_by_staff_id?: string | null
          id?: string
          main_path: string
          previous_version_id?: string | null
          pos_upload_capability_expires_at?: string | null
          product_id: string
          removed_at?: string | null
          requested_by_pos_session_id?: string | null
          requested_by_profile_id?: string | null
          requested_by_shop_device_id?: string | null
          requested_by_staff_id?: string | null
          shop_id: string
          status?: string
          superseded_at?: string | null
          thumb_path: string
          verified_main_bytes?: number | null
          verified_main_height?: number | null
          verified_main_mime_type?: string | null
          verified_main_sha256?: string | null
          verified_main_width?: number | null
          verified_thumb_bytes?: number | null
          verified_thumb_height?: number | null
          verified_thumb_mime_type?: string | null
          verified_thumb_sha256?: string | null
          verified_thumb_width?: number | null
        }
        Update: {
          actor_kind?: string
          cleanup_attempts?: number
          cleanup_last_error_code?: string | null
          cleanup_status?: string
          cleanup_updated_at?: string | null
          created_at?: string
          expected_main_bytes?: number
          expected_main_height?: number
          expected_main_mime_type?: string
          expected_main_sha256?: string
          expected_main_width?: number
          expected_thumb_bytes?: number
          expected_thumb_height?: number
          expected_thumb_mime_type?: string
          expected_thumb_sha256?: string
          expected_thumb_width?: number
          expires_at?: string
          finalized_at?: string | null
          finalized_by_pos_session_id?: string | null
          finalized_by_profile_id?: string | null
          finalized_by_shop_device_id?: string | null
          finalized_by_staff_id?: string | null
          id?: string
          main_path?: string
          previous_version_id?: string | null
          pos_upload_capability_expires_at?: string | null
          product_id?: string
          removed_at?: string | null
          requested_by_pos_session_id?: string | null
          requested_by_profile_id?: string | null
          requested_by_shop_device_id?: string | null
          requested_by_staff_id?: string | null
          shop_id?: string
          status?: string
          superseded_at?: string | null
          thumb_path?: string
          verified_main_bytes?: number | null
          verified_main_height?: number | null
          verified_main_mime_type?: string | null
          verified_main_sha256?: string | null
          verified_main_width?: number | null
          verified_thumb_bytes?: number | null
          verified_thumb_height?: number | null
          verified_thumb_mime_type?: string | null
          verified_thumb_sha256?: string | null
          verified_thumb_width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_image_versions_finalized_by_profile_id_fkey"
            columns: ["finalized_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "image_versions_finalized_session_fk"
            columns: ["finalized_by_pos_session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["pos_session_id"]
          },
          {
            foreignKeyName: "image_versions_finalized_device_fk"
            columns: ["finalized_by_shop_device_id"]
            isOneToOne: false
            referencedRelation: "shop_devices"
            referencedColumns: ["shop_device_id"]
          },
          {
            foreignKeyName: "image_versions_finalized_staff_fk"
            columns: ["finalized_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "image_versions_finalized_staff_fk"
            columns: ["finalized_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts_safe"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "inventory_product_image_versions_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_image_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_image_versions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_image_versions_requested_by_profile_id_fkey"
            columns: ["requested_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "image_versions_requested_session_fk"
            columns: ["requested_by_pos_session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["pos_session_id"]
          },
          {
            foreignKeyName: "image_versions_requested_device_fk"
            columns: ["requested_by_shop_device_id"]
            isOneToOne: false
            referencedRelation: "shop_devices"
            referencedColumns: ["shop_device_id"]
          },
          {
            foreignKeyName: "image_versions_requested_staff_fk"
            columns: ["requested_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "image_versions_requested_staff_fk"
            columns: ["requested_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts_safe"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "inventory_product_image_versions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      inventory_product_prices: {
        Row: {
          created_at: string
          effective_at: string
          id: string
          note: string | null
          owner_user_id: string
          price: number
          product_id: string
          shop_id: string | null
          source: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at: string
          effective_at: string
          id: string
          note?: string | null
          owner_user_id: string
          price: number
          product_id: string
          shop_id?: string | null
          source?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_at?: string
          id?: string
          note?: string | null
          owner_user_id?: string
          price?: number
          product_id?: string
          shop_id?: string | null
          source?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_prices_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      inventory_products: {
        Row: {
          barcode: string
          category_id: string | null
          deleted_at: string | null
          id: string
          item_number: string | null
          owner_user_id: string
          primary_image_updated_at: string | null
          primary_image_version_id: string | null
          product_name: string | null
          purchase_price: number | null
          retail_price: number | null
          second_product_name: string | null
          shop_id: string | null
          stock_quantity: number | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          barcode: string
          category_id?: string | null
          deleted_at?: string | null
          id?: string
          item_number?: string | null
          owner_user_id: string
          primary_image_updated_at?: string | null
          primary_image_version_id?: string | null
          product_name?: string | null
          purchase_price?: number | null
          retail_price?: number | null
          second_product_name?: string | null
          shop_id?: string | null
          stock_quantity?: number | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string
          category_id?: string | null
          deleted_at?: string | null
          id?: string
          item_number?: string | null
          owner_user_id?: string
          primary_image_updated_at?: string | null
          primary_image_version_id?: string | null
          product_name?: string | null
          purchase_price?: number | null
          retail_price?: number | null
          second_product_name?: string | null
          shop_id?: string | null
          stock_quantity?: number | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_products_primary_image_version_id_fkey"
            columns: ["primary_image_version_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_image_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_products_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "inventory_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "inventory_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_suppliers: {
        Row: {
          deleted_at: string | null
          id: string
          name: string
          owner_user_id: string
          shop_id: string | null
          updated_at: string
        }
        Insert: {
          deleted_at?: string | null
          id?: string
          name: string
          owner_user_id: string
          shop_id?: string | null
          updated_at?: string
        }
        Update: {
          deleted_at?: string | null
          id?: string
          name?: string
          owner_user_id?: string
          shop_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_suppliers_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          granted_at: string
          granted_by_profile_id: string | null
          last_reviewed_at: string | null
          platform_admin_id: string
          profile_id: string
          reason_redacted: string | null
          revoked_at: string | null
          revoked_by_profile_id: string | null
          status: string
        }
        Insert: {
          granted_at?: string
          granted_by_profile_id?: string | null
          last_reviewed_at?: string | null
          platform_admin_id?: string
          profile_id: string
          reason_redacted?: string | null
          revoked_at?: string | null
          revoked_by_profile_id?: string | null
          status?: string
        }
        Update: {
          granted_at?: string
          granted_by_profile_id?: string | null
          last_reviewed_at?: string | null
          platform_admin_id?: string
          profile_id?: string
          reason_redacted?: string | null
          revoked_at?: string | null
          revoked_by_profile_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_granted_by_profile_id_fkey"
            columns: ["granted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "platform_admins_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "platform_admins_revoked_by_profile_id_fkey"
            columns: ["revoked_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      platform_owner_invites: {
        Row: {
          accepted_profile_id: string | null
          audit_log_id: string | null
          created_at: string
          expires_at: string
          owner_contact_digest: string
          owner_contact_redacted: string
          platform_owner_invite_id: string
          requested_by_profile_id: string | null
          resolved_at: string | null
          shop_id: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_profile_id?: string | null
          audit_log_id?: string | null
          created_at?: string
          expires_at?: string
          owner_contact_digest: string
          owner_contact_redacted: string
          platform_owner_invite_id?: string
          requested_by_profile_id?: string | null
          resolved_at?: string | null
          shop_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_profile_id?: string | null
          audit_log_id?: string | null
          created_at?: string
          expires_at?: string
          owner_contact_digest?: string
          owner_contact_redacted?: string
          platform_owner_invite_id?: string
          requested_by_profile_id?: string | null
          resolved_at?: string | null
          shop_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_owner_invites_accepted_profile_id_fkey"
            columns: ["accepted_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "platform_owner_invites_audit_log_id_fkey"
            columns: ["audit_log_id"]
            isOneToOne: false
            referencedRelation: "audit_logs"
            referencedColumns: ["audit_log_id"]
          },
          {
            foreignKeyName: "platform_owner_invites_requested_by_profile_id_fkey"
            columns: ["requested_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "platform_owner_invites_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      pos_article_mutation_conflict_receipts: {
        Row: {
          ack_response: Json
          app_version: string | null
          attempt_token: string
          base_revision: string | null
          catalog_revision: number
          client_created_at: string
          client_product_id: string
          conflict_fingerprint: string
          created_at: string
          field_mask: Json
          idempotency_key: string
          local_sequence: number
          mutation_id: string
          mutation_kind: string
          mutation_status: string
          occurred_at: string
          payload_hash: string
          pos_article_mutation_conflict_receipt_id: string
          pos_session_id: string
          schema_version: string
          server_timestamp: string
          shop_device_id: string
          shop_id: string
          staff_credential_version: number
          staff_id: string
          target_remote_product_id: string | null
        }
        Insert: {
          ack_response: Json
          app_version?: string | null
          attempt_token: string
          base_revision?: string | null
          catalog_revision: number
          client_created_at: string
          client_product_id: string
          conflict_fingerprint: string
          created_at?: string
          field_mask?: Json
          idempotency_key: string
          local_sequence: number
          mutation_id: string
          mutation_kind: string
          mutation_status: string
          occurred_at: string
          payload_hash: string
          pos_article_mutation_conflict_receipt_id?: string
          pos_session_id: string
          schema_version?: string
          server_timestamp: string
          shop_device_id: string
          shop_id: string
          staff_credential_version: number
          staff_id: string
          target_remote_product_id?: string | null
        }
        Update: {
          ack_response?: Json
          app_version?: string | null
          attempt_token?: string
          base_revision?: string | null
          catalog_revision?: number
          client_created_at?: string
          client_product_id?: string
          conflict_fingerprint?: string
          created_at?: string
          field_mask?: Json
          idempotency_key?: string
          local_sequence?: number
          mutation_id?: string
          mutation_kind?: string
          mutation_status?: string
          occurred_at?: string
          payload_hash?: string
          pos_article_mutation_conflict_receipt_id?: string
          pos_session_id?: string
          schema_version?: string
          server_timestamp?: string
          shop_device_id?: string
          shop_id?: string
          staff_credential_version?: number
          staff_id?: string
          target_remote_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_article_mutation_conflict_receipts_pos_session_id_fkey"
            columns: ["pos_session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["pos_session_id"]
          },
          {
            foreignKeyName: "pos_article_mutation_conflict_receipts_shop_device_id_fkey"
            columns: ["shop_device_id"]
            isOneToOne: false
            referencedRelation: "shop_devices"
            referencedColumns: ["shop_device_id"]
          },
          {
            foreignKeyName: "pos_article_mutation_conflict_receipts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "pos_article_mutation_conflict_receipts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "pos_article_mutation_conflict_receipts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts_safe"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      pos_article_mutation_receipts: {
        Row: {
          ack_response: Json
          app_version: string | null
          attempt_token: string
          authoritative_revision: string | null
          base_revision: string | null
          catalog_revision: number
          client_created_at: string
          client_product_id: string
          created_at: string
          field_mask: Json
          idempotency_key: string
          local_sequence: number
          mutation_id: string
          mutation_kind: string
          mutation_status: string
          occurred_at: string
          payload_hash: string
          pos_article_mutation_receipt_id: string
          pos_session_id: string
          price_history_id: string | null
          remote_product_id: string | null
          retryable: boolean
          schema_version: string
          server_timestamp: string
          shop_device_id: string
          shop_id: string
          staff_credential_version: number
          staff_id: string
          stock_movement_id: string | null
          target_remote_product_id: string | null
          terminal: boolean
        }
        Insert: {
          ack_response: Json
          app_version?: string | null
          attempt_token: string
          authoritative_revision?: string | null
          base_revision?: string | null
          catalog_revision: number
          client_created_at: string
          client_product_id: string
          created_at?: string
          field_mask?: Json
          idempotency_key: string
          local_sequence: number
          mutation_id: string
          mutation_kind: string
          mutation_status: string
          occurred_at: string
          payload_hash: string
          pos_article_mutation_receipt_id?: string
          pos_session_id: string
          price_history_id?: string | null
          remote_product_id?: string | null
          retryable: boolean
          schema_version?: string
          server_timestamp: string
          shop_device_id: string
          shop_id: string
          staff_credential_version: number
          staff_id: string
          stock_movement_id?: string | null
          target_remote_product_id?: string | null
          terminal: boolean
        }
        Update: {
          ack_response?: Json
          app_version?: string | null
          attempt_token?: string
          authoritative_revision?: string | null
          base_revision?: string | null
          catalog_revision?: number
          client_created_at?: string
          client_product_id?: string
          created_at?: string
          field_mask?: Json
          idempotency_key?: string
          local_sequence?: number
          mutation_id?: string
          mutation_kind?: string
          mutation_status?: string
          occurred_at?: string
          payload_hash?: string
          pos_article_mutation_receipt_id?: string
          pos_session_id?: string
          price_history_id?: string | null
          remote_product_id?: string | null
          retryable?: boolean
          schema_version?: string
          server_timestamp?: string
          shop_device_id?: string
          shop_id?: string
          staff_credential_version?: number
          staff_id?: string
          stock_movement_id?: string | null
          target_remote_product_id?: string | null
          terminal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pos_article_mutation_receipts_pos_session_id_fkey"
            columns: ["pos_session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["pos_session_id"]
          },
          {
            foreignKeyName: "pos_article_mutation_receipts_price_history_id_fkey"
            columns: ["price_history_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_article_mutation_receipts_shop_device_id_fkey"
            columns: ["shop_device_id"]
            isOneToOne: false
            referencedRelation: "shop_devices"
            referencedColumns: ["shop_device_id"]
          },
          {
            foreignKeyName: "pos_article_mutation_receipts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "pos_article_mutation_receipts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "pos_article_mutation_receipts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts_safe"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "pos_article_mutation_receipts_stock_movement_id_fkey"
            columns: ["stock_movement_id"]
            isOneToOne: false
            referencedRelation: "pos_sale_stock_movements"
            referencedColumns: ["pos_sale_stock_movement_id"]
          },
        ]
      }
      pos_product_image_mutation_receipts: {
        Row: {
          app_version_class: string
          authoritative_primary_image_version_id: string | null
          catalog_revision: number
          created_at: string
          expected_current_version_id: string | null
          idempotency_key: string
          image_version_id: string | null
          intent_expires_at: string | null
          operation: string
          operation_id: string
          outcome_code: string
          outcome_status: string
          payload_hash: string
          pos_product_image_mutation_receipt_id: string
          pos_session_id: string
          primary_image_updated_at: string | null
          product_id: string
          schema_version: string
          server_timestamp: string
          shop_device_id: string
          shop_id: string
          staff_credential_version: number
          staff_id: string
          validation_code: string | null
        }
        Insert: {
          app_version_class?: string
          authoritative_primary_image_version_id?: string | null
          catalog_revision: number
          created_at?: string
          expected_current_version_id?: string | null
          idempotency_key: string
          image_version_id?: string | null
          intent_expires_at?: string | null
          operation: string
          operation_id: string
          outcome_code: string
          outcome_status: string
          payload_hash: string
          pos_product_image_mutation_receipt_id?: string
          pos_session_id: string
          primary_image_updated_at?: string | null
          product_id: string
          schema_version?: string
          server_timestamp: string
          shop_device_id: string
          shop_id: string
          staff_credential_version: number
          staff_id: string
          validation_code?: string | null
        }
        Update: {
          app_version_class?: string
          authoritative_primary_image_version_id?: string | null
          catalog_revision?: number
          created_at?: string
          expected_current_version_id?: string | null
          idempotency_key?: string
          image_version_id?: string | null
          intent_expires_at?: string | null
          operation?: string
          operation_id?: string
          outcome_code?: string
          outcome_status?: string
          payload_hash?: string
          pos_product_image_mutation_receipt_id?: string
          pos_session_id?: string
          primary_image_updated_at?: string | null
          product_id?: string
          schema_version?: string
          server_timestamp?: string
          shop_device_id?: string
          shop_id?: string
          staff_credential_version?: number
          staff_id?: string
          validation_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_product_image_receipts_current_version_fk"
            columns: ["authoritative_primary_image_version_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_image_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_product_image_receipts_version_fk"
            columns: ["image_version_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_image_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_product_image_receipts_session_fk"
            columns: ["pos_session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["pos_session_id"]
          },
          {
            foreignKeyName: "pos_product_image_receipts_device_fk"
            columns: ["shop_device_id"]
            isOneToOne: false
            referencedRelation: "shop_devices"
            referencedColumns: ["shop_device_id"]
          },
          {
            foreignKeyName: "pos_product_image_receipts_shop_fk"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "pos_product_image_receipts_staff_fk"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "pos_product_image_receipts_staff_fk"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts_safe"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      pos_device_credentials: {
        Row: {
          created_at: string
          expires_at: string
          issued_at: string
          last_used_at: string | null
          metadata_redacted: Json
          offline_authorization_expires_at: string | null
          offline_authorization_invalidated_at: string | null
          offline_authorization_issued_at: string | null
          offline_authorization_policy_version: string | null
          pos_device_credential_id: string
          revoked_at: string | null
          revoked_reason: string | null
          shop_device_id: string
          shop_id: string
          staff_credential_version: number
          staff_id: string
          status: string
          token_hash: string
          token_version: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          issued_at?: string
          last_used_at?: string | null
          metadata_redacted?: Json
          offline_authorization_expires_at?: string | null
          offline_authorization_invalidated_at?: string | null
          offline_authorization_issued_at?: string | null
          offline_authorization_policy_version?: string | null
          pos_device_credential_id?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          shop_device_id: string
          shop_id: string
          staff_credential_version: number
          staff_id: string
          status?: string
          token_hash: string
          token_version?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          issued_at?: string
          last_used_at?: string | null
          metadata_redacted?: Json
          offline_authorization_expires_at?: string | null
          offline_authorization_invalidated_at?: string | null
          offline_authorization_issued_at?: string | null
          offline_authorization_policy_version?: string | null
          pos_device_credential_id?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          shop_device_id?: string
          shop_id?: string
          staff_credential_version?: number
          staff_id?: string
          status?: string
          token_hash?: string
          token_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_device_credentials_shop_device_id_fkey"
            columns: ["shop_device_id"]
            isOneToOne: false
            referencedRelation: "shop_devices"
            referencedColumns: ["shop_device_id"]
          },
          {
            foreignKeyName: "pos_device_credentials_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "pos_device_credentials_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "pos_device_credentials_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts_safe"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      pos_sale_lines: {
        Row: {
          barcode: string | null
          amount_clp: number | null
          client_line_id: string
          created_at: string
          item_number: string | null
          line_type: string
          line_position: number
          line_total: number
          local_product_id: string | null
          metadata_redacted: Json
          original_pos_sale_line_id: string | null
          pos_sale_id: string
          pos_sale_line_id: string
          pos_sales_sync_batch_id: string
          product_id: string | null
          product_name: string | null
          quantity: number
          shop_id: string
          stock_issue_code: string | null
          stock_quantity_delta: number
          stock_sync_status: string
          unit_amount_clp: number | null
          unit_price: number
        }
        Insert: {
          barcode?: string | null
          amount_clp?: number | null
          client_line_id: string
          created_at?: string
          item_number?: string | null
          line_type?: string
          line_position: number
          line_total: number
          local_product_id?: string | null
          metadata_redacted?: Json
          original_pos_sale_line_id?: string | null
          pos_sale_id: string
          pos_sale_line_id?: string
          pos_sales_sync_batch_id: string
          product_id?: string | null
          product_name?: string | null
          quantity: number
          shop_id: string
          stock_issue_code?: string | null
          stock_quantity_delta?: number
          stock_sync_status?: string
          unit_amount_clp?: number | null
          unit_price: number
        }
        Update: {
          barcode?: string | null
          amount_clp?: number | null
          client_line_id?: string
          created_at?: string
          item_number?: string | null
          line_type?: string
          line_position?: number
          line_total?: number
          local_product_id?: string | null
          metadata_redacted?: Json
          original_pos_sale_line_id?: string | null
          pos_sale_id?: string
          pos_sale_line_id?: string
          pos_sales_sync_batch_id?: string
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          shop_id?: string
          stock_issue_code?: string | null
          stock_quantity_delta?: number
          stock_sync_status?: string
          unit_amount_clp?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_lines_original_pos_sale_line_id_fkey"
            columns: ["original_pos_sale_line_id"]
            isOneToOne: false
            referencedRelation: "pos_sale_lines"
            referencedColumns: ["pos_sale_line_id"]
          },
          {
            foreignKeyName: "pos_sale_lines_pos_sale_id_fkey"
            columns: ["pos_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["pos_sale_id"]
          },
          {
            foreignKeyName: "pos_sale_lines_pos_sales_sync_batch_id_fkey"
            columns: ["pos_sales_sync_batch_id"]
            isOneToOne: false
            referencedRelation: "pos_sales_sync_batches"
            referencedColumns: ["pos_sales_sync_batch_id"]
          },
          {
            foreignKeyName: "pos_sale_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_lines_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      pos_revenue_ledger_entries: {
        Row: {
          amount_clp: number
          barcode: string | null
          business_date: string | null
          client_entry_id: string
          created_at: string
          currency: string
          entry_type: string
          item_number: string | null
          line_position: number | null
          local_product_id: string | null
          metadata_redacted: Json
          occurred_at: string
          original_client_entry_id: string | null
          payment_method: string | null
          pos_revenue_ledger_entry_id: string
          pos_sale_id: string
          pos_sales_sync_batch_id: string
          pos_session_id: string | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          shop_device_id: string
          shop_id: string
          staff_id: string | null
        }
        Insert: {
          amount_clp: number
          barcode?: string | null
          business_date?: string | null
          client_entry_id: string
          created_at?: string
          currency?: string
          entry_type: string
          item_number?: string | null
          line_position?: number | null
          local_product_id?: string | null
          metadata_redacted?: Json
          occurred_at: string
          original_client_entry_id?: string | null
          payment_method?: string | null
          pos_revenue_ledger_entry_id?: string
          pos_sale_id: string
          pos_sales_sync_batch_id: string
          pos_session_id?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          shop_device_id: string
          shop_id: string
          staff_id?: string | null
        }
        Update: {
          amount_clp?: number
          barcode?: string | null
          business_date?: string | null
          client_entry_id?: string
          created_at?: string
          currency?: string
          entry_type?: string
          item_number?: string | null
          line_position?: number | null
          local_product_id?: string | null
          metadata_redacted?: Json
          occurred_at?: string
          original_client_entry_id?: string | null
          payment_method?: string | null
          pos_revenue_ledger_entry_id?: string
          pos_sale_id?: string
          pos_sales_sync_batch_id?: string
          pos_session_id?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          shop_device_id?: string
          shop_id?: string
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_revenue_ledger_entries_pos_sale_id_fkey"
            columns: ["pos_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["pos_sale_id"]
          },
          {
            foreignKeyName: "pos_revenue_ledger_entries_pos_sales_sync_batch_id_fkey"
            columns: ["pos_sales_sync_batch_id"]
            isOneToOne: false
            referencedRelation: "pos_sales_sync_batches"
            referencedColumns: ["pos_sales_sync_batch_id"]
          },
          {
            foreignKeyName: "pos_revenue_ledger_entries_pos_session_id_fkey"
            columns: ["pos_session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["pos_session_id"]
          },
          {
            foreignKeyName: "pos_revenue_ledger_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_revenue_ledger_entries_shop_device_id_fkey"
            columns: ["shop_device_id"]
            isOneToOne: false
            referencedRelation: "shop_devices"
            referencedColumns: ["shop_device_id"]
          },
          {
            foreignKeyName: "pos_revenue_ledger_entries_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "pos_revenue_ledger_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "pos_revenue_ledger_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts_safe"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      pos_sale_stock_movements: {
        Row: {
          created_at: string
          issue_code: string | null
          metadata_redacted: Json
          movement_key: string
          movement_kind: string
          pos_article_mutation_id: string | null
          pos_sale_id: string | null
          pos_sale_line_id: string | null
          pos_sale_stock_movement_id: string
          product_id: string | null
          quantity_delta: number
          shop_id: string
          status: string
          stock_after: number | null
          stock_before: number | null
        }
        Insert: {
          created_at?: string
          issue_code?: string | null
          metadata_redacted?: Json
          movement_key: string
          movement_kind: string
          pos_article_mutation_id?: string | null
          pos_sale_id?: string | null
          pos_sale_line_id?: string | null
          pos_sale_stock_movement_id?: string
          product_id?: string | null
          quantity_delta: number
          shop_id: string
          status: string
          stock_after?: number | null
          stock_before?: number | null
        }
        Update: {
          created_at?: string
          issue_code?: string | null
          metadata_redacted?: Json
          movement_key?: string
          movement_kind?: string
          pos_article_mutation_id?: string | null
          pos_sale_id?: string | null
          pos_sale_line_id?: string | null
          pos_sale_stock_movement_id?: string
          product_id?: string | null
          quantity_delta?: number
          shop_id?: string
          status?: string
          stock_after?: number | null
          stock_before?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_stock_movements_pos_sale_id_fkey"
            columns: ["pos_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["pos_sale_id"]
          },
          {
            foreignKeyName: "pos_sale_stock_movements_pos_sale_line_id_fkey"
            columns: ["pos_sale_line_id"]
            isOneToOne: false
            referencedRelation: "pos_sale_lines"
            referencedColumns: ["pos_sale_line_id"]
          },
          {
            foreignKeyName: "pos_sale_stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_stock_movements_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      pos_sales: {
        Row: {
          business_date: string | null
          business_kind: string
          change_amount_clp: number
          client_original_sale_id: string | null
          client_sale_id: string
          created_at: string
          currency: string
          discount_amount_clp: number | null
          discount_total: number
          fiscal_document_number_redacted: string | null
          fiscal_document_type: string | null
          fiscal_printed_at: string | null
          fiscal_status: string
          gross_amount_clp: number | null
          idempotency_key: string
          metadata_redacted: Json
          net_amount_clp: number | null
          occurred_at: string
          original_pos_sale_id: string | null
          payload_hash: string
          paid_amount_clp: number | null
          pos_sale_id: string
          pos_sales_sync_batch_id: string
          pos_session_id: string
          reversal_reason_redacted: string | null
          sale_number: string | null
          shop_code: string
          shop_device_id: string
          shop_id: string
          source_schema_version: string
          staff_id: string
          status: string
          stock_sync_status: string
          stock_warning_count: number
          subtotal: number
          tax_amount_clp: number
          tax_total: number
          total: number
          updated_at: string
        }
        Insert: {
          business_date?: string | null
          business_kind?: string
          change_amount_clp?: number
          client_original_sale_id?: string | null
          client_sale_id: string
          created_at?: string
          currency?: string
          discount_amount_clp?: number | null
          discount_total?: number
          fiscal_document_number_redacted?: string | null
          fiscal_document_type?: string | null
          fiscal_printed_at?: string | null
          fiscal_status?: string
          gross_amount_clp?: number | null
          idempotency_key: string
          metadata_redacted?: Json
          net_amount_clp?: number | null
          occurred_at: string
          original_pos_sale_id?: string | null
          payload_hash: string
          paid_amount_clp?: number | null
          pos_sale_id?: string
          pos_sales_sync_batch_id: string
          pos_session_id: string
          reversal_reason_redacted?: string | null
          sale_number?: string | null
          shop_code: string
          shop_device_id: string
          shop_id: string
          source_schema_version?: string
          staff_id: string
          status?: string
          stock_sync_status?: string
          stock_warning_count?: number
          subtotal?: number
          tax_amount_clp?: number
          tax_total?: number
          total: number
          updated_at?: string
        }
        Update: {
          business_date?: string | null
          business_kind?: string
          change_amount_clp?: number
          client_original_sale_id?: string | null
          client_sale_id?: string
          created_at?: string
          currency?: string
          discount_amount_clp?: number | null
          discount_total?: number
          fiscal_document_number_redacted?: string | null
          fiscal_document_type?: string | null
          fiscal_printed_at?: string | null
          fiscal_status?: string
          gross_amount_clp?: number | null
          idempotency_key?: string
          metadata_redacted?: Json
          net_amount_clp?: number | null
          occurred_at?: string
          original_pos_sale_id?: string | null
          payload_hash?: string
          paid_amount_clp?: number | null
          pos_sale_id?: string
          pos_sales_sync_batch_id?: string
          pos_session_id?: string
          reversal_reason_redacted?: string | null
          sale_number?: string | null
          shop_code?: string
          shop_device_id?: string
          shop_id?: string
          source_schema_version?: string
          staff_id?: string
          status?: string
          stock_sync_status?: string
          stock_warning_count?: number
          subtotal?: number
          tax_amount_clp?: number
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_original_pos_sale_id_fkey"
            columns: ["original_pos_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["pos_sale_id"]
          },
          {
            foreignKeyName: "pos_sales_pos_sales_sync_batch_id_fkey"
            columns: ["pos_sales_sync_batch_id"]
            isOneToOne: false
            referencedRelation: "pos_sales_sync_batches"
            referencedColumns: ["pos_sales_sync_batch_id"]
          },
          {
            foreignKeyName: "pos_sales_pos_session_id_fkey"
            columns: ["pos_session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["pos_session_id"]
          },
          {
            foreignKeyName: "pos_sales_shop_device_id_fkey"
            columns: ["shop_device_id"]
            isOneToOne: false
            referencedRelation: "shop_devices"
            referencedColumns: ["shop_device_id"]
          },
          {
            foreignKeyName: "pos_sales_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "pos_sales_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "pos_sales_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts_safe"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      pos_catalog_import_batches: {
        Row: {
          ack_response: Json
          accepted_item_count: number
          client_import_id: string
          conflict_count: number
          created_at: string
          duplicate_item_count: number
          idempotency_key: string
          metadata_redacted: Json
          payload_hash: string
          pos_catalog_import_batch_id: string
          pos_session_id: string | null
          product_count: number
          received_at: string
          schema_version: string
          shop_device_id: string
          shop_id: string
          source: string
          staff_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ack_response?: Json
          accepted_item_count?: number
          client_import_id: string
          conflict_count?: number
          created_at?: string
          duplicate_item_count?: number
          idempotency_key: string
          metadata_redacted?: Json
          payload_hash: string
          pos_catalog_import_batch_id?: string
          pos_session_id?: string | null
          product_count?: number
          received_at?: string
          schema_version?: string
          shop_device_id: string
          shop_id: string
          source?: string
          staff_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ack_response?: Json
          accepted_item_count?: number
          client_import_id?: string
          conflict_count?: number
          created_at?: string
          duplicate_item_count?: number
          idempotency_key?: string
          metadata_redacted?: Json
          payload_hash?: string
          pos_catalog_import_batch_id?: string
          pos_session_id?: string | null
          product_count?: number
          received_at?: string
          schema_version?: string
          shop_device_id?: string
          shop_id?: string
          source?: string
          staff_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_catalog_import_batches_pos_session_id_fkey"
            columns: ["pos_session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["pos_session_id"]
          },
          {
            foreignKeyName: "pos_catalog_import_batches_shop_device_id_fkey"
            columns: ["shop_device_id"]
            isOneToOne: false
            referencedRelation: "shop_devices"
            referencedColumns: ["shop_device_id"]
          },
          {
            foreignKeyName: "pos_catalog_import_batches_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "pos_catalog_import_batches_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "pos_catalog_import_batches_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts_safe"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      pos_sales_sync_batches: {
        Row: {
          client_batch_id: string
          conflict_count: number
          created_at: string
          idempotency_key: string
          line_count: number
          metadata_redacted: Json
          payload_hash: string
          pos_sales_sync_batch_id: string
          pos_session_id: string
          received_at: string
          sale_count: number
          shop_code: string
          shop_device_id: string
          shop_id: string
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          client_batch_id: string
          conflict_count?: number
          created_at?: string
          idempotency_key: string
          line_count?: number
          metadata_redacted?: Json
          payload_hash: string
          pos_sales_sync_batch_id?: string
          pos_session_id: string
          received_at?: string
          sale_count?: number
          shop_code: string
          shop_device_id: string
          shop_id: string
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_batch_id?: string
          conflict_count?: number
          created_at?: string
          idempotency_key?: string
          line_count?: number
          metadata_redacted?: Json
          payload_hash?: string
          pos_sales_sync_batch_id?: string
          pos_session_id?: string
          received_at?: string
          sale_count?: number
          shop_code?: string
          shop_device_id?: string
          shop_id?: string
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_sync_batches_pos_session_id_fkey"
            columns: ["pos_session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["pos_session_id"]
          },
          {
            foreignKeyName: "pos_sales_sync_batches_shop_device_id_fkey"
            columns: ["shop_device_id"]
            isOneToOne: false
            referencedRelation: "shop_devices"
            referencedColumns: ["shop_device_id"]
          },
          {
            foreignKeyName: "pos_sales_sync_batches_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "pos_sales_sync_batches_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "pos_sales_sync_batches_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts_safe"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      pos_sessions: {
        Row: {
          created_at: string
          expires_at: string
          heartbeat_count: number
          issued_at: string
          last_seen_at: string | null
          last_seen_principal_kind: string
          last_seen_profile_id: string | null
          last_seen_staff_id: string | null
          metadata_redacted: Json
          offline_authorization_expires_at: string | null
          offline_authorization_invalidated_at: string | null
          offline_authorization_issued_at: string | null
          offline_authorization_policy_version: string | null
          pos_device_credential_id: string
          pos_session_id: string
          revoked_at: string | null
          revoked_reason: string | null
          session_token_hash: string
          shop_device_id: string
          shop_id: string
          staff_credential_version: number
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          heartbeat_count?: number
          issued_at?: string
          last_seen_at?: string | null
          last_seen_principal_kind?: string
          last_seen_profile_id?: string | null
          last_seen_staff_id?: string | null
          metadata_redacted?: Json
          offline_authorization_expires_at?: string | null
          offline_authorization_invalidated_at?: string | null
          offline_authorization_issued_at?: string | null
          offline_authorization_policy_version?: string | null
          pos_device_credential_id: string
          pos_session_id?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          session_token_hash: string
          shop_device_id: string
          shop_id: string
          staff_credential_version: number
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          heartbeat_count?: number
          issued_at?: string
          last_seen_at?: string | null
          last_seen_principal_kind?: string
          last_seen_profile_id?: string | null
          last_seen_staff_id?: string | null
          metadata_redacted?: Json
          offline_authorization_expires_at?: string | null
          offline_authorization_invalidated_at?: string | null
          offline_authorization_issued_at?: string | null
          offline_authorization_policy_version?: string | null
          pos_device_credential_id?: string
          pos_session_id?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          session_token_hash?: string
          shop_device_id?: string
          shop_id?: string
          staff_credential_version?: number
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sessions_pos_device_credential_id_fkey"
            columns: ["pos_device_credential_id"]
            isOneToOne: false
            referencedRelation: "pos_device_credentials"
            referencedColumns: ["pos_device_credential_id"]
          },
          {
            foreignKeyName: "pos_sessions_shop_device_id_fkey"
            columns: ["shop_device_id"]
            isOneToOne: false
            referencedRelation: "shop_devices"
            referencedColumns: ["shop_device_id"]
          },
          {
            foreignKeyName: "pos_sessions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "pos_sessions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "pos_sessions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts_safe"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          disabled_at: string | null
          disabled_by_profile_id: string | null
          display_name: string
          profile_id: string
          profile_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          disabled_by_profile_id?: string | null
          display_name: string
          profile_id: string
          profile_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
          disabled_by_profile_id?: string | null
          display_name?: string
          profile_id?: string
          profile_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_disabled_by_profile_id_fkey"
            columns: ["disabled_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      shared_sheet_sessions: {
        Row: {
          category: string
          data: Json
          deleted_at: string | null
          display_name: string
          is_manual_entry: boolean
          owner_user_id: string
          payload_version: number
          remote_id: string
          session_overlay: Json | null
          shop_id: string | null
          supplier: string
          timestamp: string
          updated_at: string
        }
        Insert: {
          category?: string
          data: Json
          deleted_at?: string | null
          display_name?: string
          is_manual_entry?: boolean
          owner_user_id: string
          payload_version: number
          remote_id: string
          session_overlay?: Json | null
          shop_id?: string | null
          supplier?: string
          timestamp: string
          updated_at?: string
        }
        Update: {
          category?: string
          data?: Json
          deleted_at?: string | null
          display_name?: string
          is_manual_entry?: boolean
          owner_user_id?: string
          payload_version?: number
          remote_id?: string
          session_overlay?: Json | null
          shop_id?: string | null
          supplier?: string
          timestamp?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_sheet_sessions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      shop_devices: {
        Row: {
          app_version: string | null
          created_at: string
          created_by_profile_id: string | null
          device_identifier: string
          device_type: string
          display_name: string
          last_seen_at: string | null
          last_seen_principal_kind: string
          last_seen_profile_id: string | null
          last_seen_staff_id: string | null
          metadata_redacted: Json
          reactivated_at: string | null
          reactivated_by_profile_id: string | null
          revoked_at: string | null
          revoked_by_profile_id: string | null
          shop_device_id: string
          shop_id: string
          status: string
          updated_at: string
          updated_by_profile_id: string | null
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          device_identifier: string
          device_type?: string
          display_name: string
          last_seen_at?: string | null
          last_seen_principal_kind?: string
          last_seen_profile_id?: string | null
          last_seen_staff_id?: string | null
          metadata_redacted?: Json
          reactivated_at?: string | null
          reactivated_by_profile_id?: string | null
          revoked_at?: string | null
          revoked_by_profile_id?: string | null
          shop_device_id?: string
          shop_id: string
          status?: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Update: {
          app_version?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          device_identifier?: string
          device_type?: string
          display_name?: string
          last_seen_at?: string | null
          last_seen_principal_kind?: string
          last_seen_profile_id?: string | null
          last_seen_staff_id?: string | null
          metadata_redacted?: Json
          reactivated_at?: string | null
          reactivated_by_profile_id?: string | null
          revoked_at?: string | null
          revoked_by_profile_id?: string | null
          shop_device_id?: string
          shop_id?: string
          status?: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_devices_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "shop_devices_last_seen_profile_id_fkey"
            columns: ["last_seen_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "shop_devices_last_seen_staff_id_fkey"
            columns: ["last_seen_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "shop_devices_last_seen_staff_id_fkey"
            columns: ["last_seen_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts_safe"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "shop_devices_reactivated_by_profile_id_fkey"
            columns: ["reactivated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "shop_devices_revoked_by_profile_id_fkey"
            columns: ["revoked_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "shop_devices_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "shop_devices_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      shop_inventory_sources: {
        Row: {
          created_at: string
          created_by_profile_id: string | null
          disabled_at: string | null
          disabled_by_profile_id: string | null
          mapping_state: string
          owner_user_id: string | null
          shop_id: string | null
          shop_inventory_source_id: string
          source_kind: string
          verified_at: string | null
          verified_by_profile_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_profile_id?: string | null
          disabled_at?: string | null
          disabled_by_profile_id?: string | null
          mapping_state?: string
          owner_user_id?: string | null
          shop_id?: string | null
          shop_inventory_source_id?: string
          source_kind?: string
          verified_at?: string | null
          verified_by_profile_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string | null
          disabled_at?: string | null
          disabled_by_profile_id?: string | null
          mapping_state?: string
          owner_user_id?: string | null
          shop_id?: string | null
          shop_inventory_source_id?: string
          source_kind?: string
          verified_at?: string | null
          verified_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_inventory_sources_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "shop_inventory_sources_disabled_by_profile_id_fkey"
            columns: ["disabled_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "shop_inventory_sources_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "shop_inventory_sources_verified_by_profile_id_fkey"
            columns: ["verified_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      shop_members: {
        Row: {
          created_at: string
          invited_by_profile_id: string | null
          membership_status: string
          profile_id: string
          role_key: string
          shop_id: string
          shop_member_id: string
          suspended_at: string | null
          suspended_by_profile_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          invited_by_profile_id?: string | null
          membership_status?: string
          profile_id: string
          role_key: string
          shop_id: string
          shop_member_id?: string
          suspended_at?: string | null
          suspended_by_profile_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          invited_by_profile_id?: string | null
          membership_status?: string
          profile_id?: string
          role_key?: string
          shop_id?: string
          shop_member_id?: string
          suspended_at?: string | null
          suspended_by_profile_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_members_invited_by_profile_id_fkey"
            columns: ["invited_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "shop_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "shop_members_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "shop_members_suspended_by_profile_id_fkey"
            columns: ["suspended_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      shops: {
        Row: {
          archived_at: string | null
          archived_by_profile_id: string | null
          business_address: string | null
          business_city: string | null
          business_giro: string | null
          company_rut: string | null
          created_at: string
          created_by_profile_id: string | null
          fiscal_identity_locked_by_platform: boolean
          fiscal_identity_updated_at: string | null
          fiscal_identity_updated_by_profile_id: string | null
          legal_representative_rut: string | null
          shop_code: string
          shop_id: string
          shop_name: string
          shop_status: string
          status_changed_at: string
          status_changed_by_profile_id: string | null
          status_reason_redacted: string | null
          suspended_at: string | null
          suspended_by_profile_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by_profile_id?: string | null
          business_address?: string | null
          business_city?: string | null
          business_giro?: string | null
          company_rut?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          fiscal_identity_locked_by_platform?: boolean
          fiscal_identity_updated_at?: string | null
          fiscal_identity_updated_by_profile_id?: string | null
          legal_representative_rut?: string | null
          shop_code: string
          shop_id?: string
          shop_name: string
          shop_status?: string
          status_changed_at?: string
          status_changed_by_profile_id?: string | null
          status_reason_redacted?: string | null
          suspended_at?: string | null
          suspended_by_profile_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by_profile_id?: string | null
          business_address?: string | null
          business_city?: string | null
          business_giro?: string | null
          company_rut?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          fiscal_identity_locked_by_platform?: boolean
          fiscal_identity_updated_at?: string | null
          fiscal_identity_updated_by_profile_id?: string | null
          legal_representative_rut?: string | null
          shop_code?: string
          shop_id?: string
          shop_name?: string
          shop_status?: string
          status_changed_at?: string
          status_changed_by_profile_id?: string | null
          status_reason_redacted?: string | null
          suspended_at?: string | null
          suspended_by_profile_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shops_archived_by_profile_id_fkey"
            columns: ["archived_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "shops_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "shops_fiscal_identity_updated_by_profile_id_fkey"
            columns: ["fiscal_identity_updated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "shops_status_changed_by_profile_id_fkey"
            columns: ["status_changed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "shops_suspended_by_profile_id_fkey"
            columns: ["suspended_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      staff_accounts: {
        Row: {
          created_at: string
          created_by_profile_id: string | null
          credential_expires_at: string | null
          credential_hash: string | null
          credential_kind: string | null
          credential_status: string
          credential_updated_at: string | null
          credential_version: number
          display_name: string
          failed_attempts: number
          last_login_at: string | null
          locked_until: string | null
          max_discount_percent: number
          must_change_credential: boolean
          role_key: string
          session_invalidated_at: string | null
          shop_id: string
          staff_code: string
          staff_id: string
          status: string
          updated_at: string
          updated_by_profile_id: string | null
          web_access_revoked_at: string | null
          web_access_revoked_by_staff_id: string | null
          web_access_revoked_reason: string | null
        }
        Insert: {
          created_at?: string
          created_by_profile_id?: string | null
          credential_expires_at?: string | null
          credential_hash?: string | null
          credential_kind?: string | null
          credential_status?: string
          credential_updated_at?: string | null
          credential_version?: number
          display_name: string
          failed_attempts?: number
          last_login_at?: string | null
          locked_until?: string | null
          max_discount_percent?: number
          must_change_credential?: boolean
          role_key: string
          session_invalidated_at?: string | null
          shop_id: string
          staff_code: string
          staff_id?: string
          status?: string
          updated_at?: string
          updated_by_profile_id?: string | null
          web_access_revoked_at?: string | null
          web_access_revoked_by_staff_id?: string | null
          web_access_revoked_reason?: string | null
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string | null
          credential_expires_at?: string | null
          credential_hash?: string | null
          credential_kind?: string | null
          credential_status?: string
          credential_updated_at?: string | null
          credential_version?: number
          display_name?: string
          failed_attempts?: number
          last_login_at?: string | null
          locked_until?: string | null
          max_discount_percent?: number
          must_change_credential?: boolean
          role_key?: string
          session_invalidated_at?: string | null
          shop_id?: string
          staff_code?: string
          staff_id?: string
          status?: string
          updated_at?: string
          updated_by_profile_id?: string | null
          web_access_revoked_at?: string | null
          web_access_revoked_by_staff_id?: string | null
          web_access_revoked_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_accounts_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "staff_accounts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "staff_accounts_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "staff_accounts_web_access_revoked_by_staff_id_fkey"
            columns: ["web_access_revoked_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "staff_accounts_web_access_revoked_by_staff_id_fkey"
            columns: ["web_access_revoked_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts_safe"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      staff_role_permissions: {
        Row: {
          created_at: string
          enabled: boolean
          permission_key: string
          role_key: string
          shop_id: string
          staff_role_permission_id: string
          updated_at: string
          updated_by_profile_id: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          permission_key: string
          role_key: string
          shop_id: string
          staff_role_permission_id?: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          permission_key?: string
          role_key?: string
          shop_id?: string
          staff_role_permission_id?: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_role_permissions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "staff_role_permissions_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      staff_web_login_attempts: {
        Row: {
          attempt_key_hash: string
          created_at: string
          failed_attempts: number
          last_failed_at: string | null
          last_success_at: string | null
          locked_until: string | null
          metadata_redacted: Json
          updated_at: string
        }
        Insert: {
          attempt_key_hash: string
          created_at?: string
          failed_attempts?: number
          last_failed_at?: string | null
          last_success_at?: string | null
          locked_until?: string | null
          metadata_redacted?: Json
          updated_at?: string
        }
        Update: {
          attempt_key_hash?: string
          created_at?: string
          failed_attempts?: number
          last_failed_at?: string | null
          last_success_at?: string | null
          locked_until?: string | null
          metadata_redacted?: Json
          updated_at?: string
        }
        Relationships: []
      }
      staff_web_sessions: {
        Row: {
          created_at: string
          expires_at: string
          issued_at: string
          last_seen_at: string | null
          metadata_redacted: Json
          revoked_at: string | null
          revoked_reason: string | null
          session_token_hash: string
          shop_id: string
          staff_credential_version: number
          staff_id: string
          staff_web_session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          issued_at?: string
          last_seen_at?: string | null
          metadata_redacted?: Json
          revoked_at?: string | null
          revoked_reason?: string | null
          session_token_hash: string
          shop_id: string
          staff_credential_version: number
          staff_id: string
          staff_web_session_id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          issued_at?: string
          last_seen_at?: string | null
          metadata_redacted?: Json
          revoked_at?: string | null
          revoked_reason?: string | null
          session_token_hash?: string
          shop_id?: string
          staff_credential_version?: number
          staff_id?: string
          staff_web_session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_web_sessions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "staff_web_sessions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "staff_web_sessions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_accounts_safe"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      storefront_image_publication_variants: {
        Row: {
          cleanup_after: string | null
          cleanup_attempts: number
          cleanup_claimed_at: string | null
          cleanup_claim_token: string | null
          cleanup_last_error: string | null
          content_type: string
          created_at: string
          expected_bytes: number
          expected_height: number
          expected_sha256: string
          expected_width: number
          id: string
          image_publication_id: string
          object_path: string
          public_url: string | null
          publication_status: string
          ready_at: string | null
          shop_id: string
          updated_at: string
          variant: string
          verified_bytes: number | null
          verified_height: number | null
          verified_sha256: string | null
          verified_width: number | null
        }
        Insert: {
          cleanup_after?: string | null
          cleanup_attempts?: number
          cleanup_claimed_at?: string | null
          cleanup_claim_token?: string | null
          cleanup_last_error?: string | null
          content_type?: string
          created_at?: string
          expected_bytes: number
          expected_height: number
          expected_sha256: string
          expected_width: number
          id?: string
          image_publication_id: string
          object_path: string
          public_url?: string | null
          publication_status?: string
          ready_at?: string | null
          shop_id: string
          updated_at?: string
          variant: string
          verified_bytes?: number | null
          verified_height?: number | null
          verified_sha256?: string | null
          verified_width?: number | null
        }
        Update: {
          cleanup_after?: string | null
          cleanup_attempts?: number
          cleanup_claimed_at?: string | null
          cleanup_claim_token?: string | null
          cleanup_last_error?: string | null
          content_type?: string
          created_at?: string
          expected_bytes?: number
          expected_height?: number
          expected_sha256?: string
          expected_width?: number
          id?: string
          image_publication_id?: string
          object_path?: string
          public_url?: string | null
          publication_status?: string
          ready_at?: string | null
          shop_id?: string
          updated_at?: string
          variant?: string
          verified_bytes?: number | null
          verified_height?: number | null
          verified_sha256?: string | null
          verified_width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "storefront_image_variants_image_fkey"
            columns: ["shop_id", "image_publication_id"]
            isOneToOne: false
            referencedRelation: "storefront_image_publications"
            referencedColumns: ["shop_id", "id"]
          },
        ]
      }
      sync_events: {
        Row: {
          batch_id: string | null
          changed_count: number
          client_event_id: string | null
          created_at: string
          domain: string
          entity_ids: Json | null
          event_type: string
          expires_at: string | null
          id: number
          metadata: Json
          owner_user_id: string
          shop_id: string | null
          source: string | null
          source_device_id: string | null
          store_id: string | null
        }
        Insert: {
          batch_id?: string | null
          changed_count?: number
          client_event_id?: string | null
          created_at?: string
          domain: string
          entity_ids?: Json | null
          event_type: string
          expires_at?: string | null
          id?: never
          metadata?: Json
          owner_user_id: string
          shop_id?: string | null
          source?: string | null
          source_device_id?: string | null
          store_id?: string | null
        }
        Update: {
          batch_id?: string | null
          changed_count?: number
          client_event_id?: string | null
          created_at?: string
          domain?: string
          entity_ids?: Json | null
          event_type?: string
          expires_at?: string | null
          id?: never
          metadata?: Json
          owner_user_id?: string
          shop_id?: string | null
          source?: string | null
          source_device_id?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
          customer_account_deletion_requests: {
        Row: {
          cancelled_at: string | null
          id: string
          idempotency_key: string
          processed_at: string | null
          requested_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          id?: string
          idempotency_key: string
          processed_at?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          id?: string
          idempotency_key?: string
          processed_at?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_addresses: {
        Row: {
          address_line_1: string
          address_line_2: string | null
          commune: string
          country_code: string
          created_at: string
          delivery_instructions: string | null
          id: string
          is_default: boolean
          label: string
          last_selected_at: string | null
          latitude: number | null
          location_accuracy_meters: number | null
          location_source: string
          longitude: number | null
          postal_code: string | null
          provider_place_id: string | null
          recipient_name: string
          recipient_phone_e164: string | null
          region: string
          updated_at: string
          user_id: string
          validated_at: string | null
          version: number
        }
        Insert: {
          address_line_1: string
          address_line_2?: string | null
          commune: string
          country_code?: string
          created_at?: string
          delivery_instructions?: string | null
          id?: string
          is_default?: boolean
          label: string
          last_selected_at?: string | null
          latitude?: number | null
          location_accuracy_meters?: number | null
          location_source?: string
          longitude?: number | null
          postal_code?: string | null
          provider_place_id?: string | null
          recipient_name: string
          recipient_phone_e164?: string | null
          region: string
          updated_at?: string
          user_id?: string
          validated_at?: string | null
          version?: number
        }
        Update: {
          address_line_1?: string
          address_line_2?: string | null
          commune?: string
          country_code?: string
          created_at?: string
          delivery_instructions?: string | null
          id?: string
          is_default?: boolean
          label?: string
          last_selected_at?: string | null
          latitude?: number | null
          location_accuracy_meters?: number | null
          location_source?: string
          longitude?: number | null
          postal_code?: string | null
          provider_place_id?: string | null
          recipient_name?: string
          recipient_phone_e164?: string | null
          region?: string
          updated_at?: string
          user_id?: string
          validated_at?: string | null
          version?: number
        }
        Relationships: []
      }
      customer_cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          publication_id: string
          quantity: number
          shop_id: string
          snapshot_at: string
          snapshot_compare_at_price_clp: number | null
          snapshot_image_url: string | null
          snapshot_price_clp: number
          snapshot_promotion_ends_at: string | null
          snapshot_promotion_id: string | null
          snapshot_public_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          publication_id: string
          quantity: number
          shop_id: string
          snapshot_at?: string
          snapshot_compare_at_price_clp?: number | null
          snapshot_image_url?: string | null
          snapshot_price_clp: number
          snapshot_promotion_ends_at?: string | null
          snapshot_promotion_id?: string | null
          snapshot_public_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          publication_id?: string
          quantity?: number
          shop_id?: string
          snapshot_at?: string
          snapshot_compare_at_price_clp?: number | null
          snapshot_image_url?: string | null
          snapshot_price_clp?: number
          snapshot_promotion_ends_at?: string | null
          snapshot_promotion_id?: string | null
          snapshot_public_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_cart_items_cart_owner_fkey"
            columns: ["user_id", "shop_id", "cart_id"]
            referencedRelation: "customer_carts"
            referencedColumns: ["user_id", "shop_id", "id"]
          },
        ]
      }
      customer_cart_mutations: {
        Row: {
          cart_id: string
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string
          operation: string
          request_hash: string
          response_payload: Json
          shop_id: string
          user_id: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key: string
          operation: string
          request_hash: string
          response_payload: Json
          shop_id: string
          user_id: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          operation?: string
          request_hash?: string
          response_payload?: Json
          shop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_cart_mutations_cart_owner_fkey"
            columns: ["user_id", "shop_id", "cart_id"]
            referencedRelation: "customer_carts"
            referencedColumns: ["user_id", "shop_id", "id"]
          },
        ]
      }
      customer_carts: {
        Row: {
          cart_version: number
          created_at: string
          id: string
          last_revalidated_at: string | null
          shop_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cart_version?: number
          created_at?: string
          id?: string
          last_revalidated_at?: string | null
          shop_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cart_version?: number
          created_at?: string
          id?: string
          last_revalidated_at?: string | null
          shop_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_carts_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      customer_checkout_mutations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string
          operation: string
          quote_id: string | null
          request_sha256: string
          response_payload: Json
          shop_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key: string
          operation: string
          quote_id?: string | null
          request_sha256: string
          response_payload: Json
          shop_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          operation?: string
          quote_id?: string | null
          request_sha256?: string
          response_payload?: Json
          shop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_checkout_mutations_quote_id_fkey"
            columns: ["quote_id"]
            referencedRelation: "customer_checkout_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_checkout_mutations_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      customer_checkout_quotes: {
        Row: {
          address_id: string | null
          address_snapshot: Json | null
          cart_id: string
          cart_version: number
          changes: Json
          confirmed_at: string | null
          consumed_at: string | null
          currency_code: string
          delivery_fee_clp: number
          delivery_zone_id: string | null
          expires_at: string
          fulfillment_mode: string
          id: string
          items_snapshot: Json
          pickup_point_id: string | null
          quote_version: number
          quoted_at: string
          shop_id: string
          slot_id: string
          status: string
          subtotal_clp: number
          total_clp: number
          updated_at: string
          user_id: string
        }
        Insert: {
          address_id?: string | null
          address_snapshot?: Json | null
          cart_id: string
          cart_version: number
          changes?: Json
          confirmed_at?: string | null
          consumed_at?: string | null
          currency_code?: string
          delivery_fee_clp?: number
          delivery_zone_id?: string | null
          expires_at: string
          fulfillment_mode: string
          id?: string
          items_snapshot: Json
          pickup_point_id?: string | null
          quote_version?: number
          quoted_at?: string
          shop_id: string
          slot_id: string
          status: string
          subtotal_clp: number
          total_clp: number
          updated_at?: string
          user_id: string
        }
        Update: {
          address_id?: string | null
          address_snapshot?: Json | null
          cart_id?: string
          cart_version?: number
          changes?: Json
          confirmed_at?: string | null
          consumed_at?: string | null
          currency_code?: string
          delivery_fee_clp?: number
          delivery_zone_id?: string | null
          expires_at?: string
          fulfillment_mode?: string
          id?: string
          items_snapshot?: Json
          pickup_point_id?: string | null
          quote_version?: number
          quoted_at?: string
          shop_id?: string
          slot_id?: string
          status?: string
          subtotal_clp?: number
          total_clp?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_checkout_quotes_address_owner_fkey"
            columns: ["user_id", "address_id"]
            referencedRelation: "customer_addresses"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "customer_checkout_quotes_cart_owner_fkey"
            columns: ["user_id", "shop_id", "cart_id"]
            referencedRelation: "customer_carts"
            referencedColumns: ["user_id", "shop_id", "id"]
          },
          {
            foreignKeyName: "customer_checkout_quotes_pickup_fkey"
            columns: ["shop_id", "pickup_point_id"]
            referencedRelation: "storefront_pickup_points"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "customer_checkout_quotes_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "customer_checkout_quotes_slot_fkey"
            columns: ["shop_id", "slot_id"]
            referencedRelation: "storefront_fulfillment_slots"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "customer_checkout_quotes_zone_fkey"
            columns: ["shop_id", "delivery_zone_id"]
            referencedRelation: "storefront_delivery_zones"
            referencedColumns: ["shop_id", "id"]
          },
        ]
      }
      customer_delivery_contexts: {
        Row: {
          address_id: string | null
          delivery_zone_id: string | null
          earliest_slot_ends_at: string | null
          earliest_slot_starts_at: string | null
          estimated_fee_clp: number | null
          mode: string
          owner_user_id: string
          pickup_point_id: string | null
          selected_at: string
          server_time: string
          serviceability_status: string
          shop_id: string
          shop_slug: string
          version: number
        }
        Insert: {
          address_id?: string | null
          delivery_zone_id?: string | null
          earliest_slot_ends_at?: string | null
          earliest_slot_starts_at?: string | null
          estimated_fee_clp?: number | null
          mode: string
          owner_user_id: string
          pickup_point_id?: string | null
          selected_at?: string
          server_time?: string
          serviceability_status: string
          shop_id: string
          shop_slug: string
          version?: number
        }
        Update: {
          address_id?: string | null
          delivery_zone_id?: string | null
          earliest_slot_ends_at?: string | null
          earliest_slot_starts_at?: string | null
          estimated_fee_clp?: number | null
          mode?: string
          owner_user_id?: string
          pickup_point_id?: string | null
          selected_at?: string
          server_time?: string
          serviceability_status?: string
          shop_id?: string
          shop_slug?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_delivery_context_address_owner_fkey"
            columns: ["owner_user_id", "address_id"]
            referencedRelation: "customer_addresses"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "customer_delivery_context_pickup_fkey"
            columns: ["shop_id", "pickup_point_id"]
            referencedRelation: "storefront_pickup_points"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "customer_delivery_context_zone_fkey"
            columns: ["shop_id", "delivery_zone_id"]
            referencedRelation: "storefront_delivery_zones"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "customer_delivery_contexts_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      customer_devices: {
        Row: {
          consent_status: string
          consented_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          installation_id: string
          last_idempotency_key: string
          last_operation: string
          last_request_hash: string
          last_seen_at: string
          locale: string
          permission_status: string
          platform: string
          push_token: string | null
          push_token_hash: string | null
          registration_version: number
          revoked_at: string | null
          token_updated_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          consent_status?: string
          consented_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          installation_id: string
          last_idempotency_key: string
          last_operation?: string
          last_request_hash: string
          last_seen_at?: string
          locale?: string
          permission_status?: string
          platform: string
          push_token?: string | null
          push_token_hash?: string | null
          registration_version?: number
          revoked_at?: string | null
          token_updated_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          consent_status?: string
          consented_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          installation_id?: string
          last_idempotency_key?: string
          last_operation?: string
          last_request_hash?: string
          last_seen_at?: string
          locale?: string
          permission_status?: string
          platform?: string
          push_token?: string | null
          push_token_hash?: string | null
          registration_version?: number
          revoked_at?: string | null
          token_updated_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_notification_deliveries: {
        Row: {
          attempt_count: number
          available_at: string
          created_at: string
          delivered_at: string | null
          destination_generation: number
          device_id: string
          event_id: string
          id: string
          last_error_code: string | null
          lease_expires_at: string | null
          lease_token: string | null
          provider_message_id_hash: string | null
          retained_until: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          created_at?: string
          delivered_at?: string | null
          destination_generation: number
          device_id: string
          event_id: string
          id?: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          provider_message_id_hash?: string | null
          retained_until?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          created_at?: string
          delivered_at?: string | null
          destination_generation?: number
          device_id?: string
          event_id?: string
          id?: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          provider_message_id_hash?: string | null
          retained_until?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notification_deliveries_device_id_fkey"
            columns: ["device_id"]
            referencedRelation: "customer_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notification_deliveries_event_id_fkey"
            columns: ["event_id"]
            referencedRelation: "customer_notification_events"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notification_events: {
        Row: {
          body_key: string
          category: string
          created_at: string
          destination_id: string | null
          destination_type: string
          event_key: string
          event_version: number
          expires_at: string | null
          id: string
          occurred_at: string
          order_id: string | null
          public_order_code_short: string | null
          read_at: string | null
          reservation_hold_id: string | null
          route_token: string
          safe_arguments: Json
          shop_id: string
          shop_slug: string
          source_event_id: string | null
          source_kind: string
          title_key: string
          user_id: string
        }
        Insert: {
          body_key?: string
          category?: string
          created_at?: string
          destination_id?: string | null
          destination_type?: string
          event_key: string
          event_version: number
          expires_at?: string | null
          id?: string
          occurred_at: string
          order_id?: string | null
          public_order_code_short?: string | null
          read_at?: string | null
          reservation_hold_id?: string | null
          route_token?: string
          safe_arguments?: Json
          shop_id: string
          shop_slug: string
          source_event_id?: string | null
          source_kind: string
          title_key?: string
          user_id: string
        }
        Update: {
          body_key?: string
          category?: string
          created_at?: string
          destination_id?: string | null
          destination_type?: string
          event_key?: string
          event_version?: number
          expires_at?: string | null
          id?: string
          occurred_at?: string
          order_id?: string | null
          public_order_code_short?: string | null
          read_at?: string | null
          reservation_hold_id?: string | null
          route_token?: string
          safe_arguments?: Json
          shop_id?: string
          shop_slug?: string
          source_event_id?: string | null
          source_kind?: string
          title_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notification_events_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notification_events_reservation_hold_id_fkey"
            columns: ["reservation_hold_id"]
            referencedRelation: "customer_reservation_holds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notification_events_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "customer_notification_events_source_event_id_fkey"
            columns: ["source_event_id"]
            referencedRelation: "customer_order_status_events"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notification_receipts: {
        Row: {
          ack_idempotency_key: string
          created_at: string
          delivery_id: string
          id: string
          request_sha256: string
          response_payload: Json
          retained_until: string
        }
        Insert: {
          ack_idempotency_key: string
          created_at?: string
          delivery_id: string
          id?: string
          request_sha256: string
          response_payload: Json
          retained_until?: string
        }
        Update: {
          ack_idempotency_key?: string
          created_at?: string
          delivery_id?: string
          id?: string
          request_sha256?: string
          response_payload?: Json
          retained_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notification_receipts_delivery_id_fkey"
            columns: ["delivery_id"]
            referencedRelation: "customer_notification_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_order_admin_mutations: {
        Row: {
          actor_kind: string
          actor_profile_id: string | null
          actor_staff_id: string | null
          created_at: string
          expected_status_version: number
          id: string
          idempotency_key: string
          operation: string
          order_id: string
          request_sha256: string
          response_payload: Json
          retained_until: string
          shop_id: string
        }
        Insert: {
          actor_kind: string
          actor_profile_id?: string | null
          actor_staff_id?: string | null
          created_at?: string
          expected_status_version: number
          id?: string
          idempotency_key: string
          operation: string
          order_id: string
          request_sha256: string
          response_payload: Json
          retained_until?: string
          shop_id: string
        }
        Update: {
          actor_kind?: string
          actor_profile_id?: string | null
          actor_staff_id?: string | null
          created_at?: string
          expected_status_version?: number
          id?: string
          idempotency_key?: string
          operation?: string
          order_id?: string
          request_sha256?: string
          response_payload?: Json
          retained_until?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_admin_mutations_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "customer_order_admin_mutations_actor_staff_id_fkey"
            columns: ["actor_staff_id"]
            referencedRelation: "staff_accounts"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "customer_order_admin_mutations_actor_staff_id_fkey"
            columns: ["actor_staff_id"]
            referencedRelation: "staff_accounts_safe"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "customer_order_admin_mutations_order_shop_fkey"
            columns: ["shop_id", "order_id"]
            referencedRelation: "customer_orders"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "customer_order_admin_mutations_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      customer_order_items: {
        Row: {
          compare_at_price_clp: number | null
          created_at: string
          hold_id: string | null
          id: string
          line_position: number
          line_total_clp: number
          order_id: string
          promotion_ends_at: string | null
          promotion_name: string | null
          public_name: string
          publication_id: string
          quantity: number
          shop_id: string
          source_product_id: string
          unit_price_clp: number
        }
        Insert: {
          compare_at_price_clp?: number | null
          created_at?: string
          hold_id?: string | null
          id?: string
          line_position: number
          line_total_clp: number
          order_id: string
          promotion_ends_at?: string | null
          promotion_name?: string | null
          public_name: string
          publication_id: string
          quantity: number
          shop_id: string
          source_product_id: string
          unit_price_clp: number
        }
        Update: {
          compare_at_price_clp?: number | null
          created_at?: string
          hold_id?: string | null
          id?: string
          line_position?: number
          line_total_clp?: number
          order_id?: string
          promotion_ends_at?: string | null
          promotion_name?: string | null
          public_name?: string
          publication_id?: string
          quantity?: number
          shop_id?: string
          source_product_id?: string
          unit_price_clp?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_items_hold_id_fkey"
            columns: ["hold_id"]
            referencedRelation: "customer_reservation_holds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_items_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_items_order_shop_fkey"
            columns: ["shop_id", "order_id"]
            referencedRelation: "customer_orders"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "customer_order_items_publication_fkey"
            columns: ["shop_id", "publication_id"]
            referencedRelation: "storefront_product_publications"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "customer_order_items_source_product_id_fkey"
            columns: ["source_product_id"]
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_order_mutations: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          operation: string
          order_id: string | null
          quote_id: string | null
          request_sha256: string
          response_payload: Json
          retained_until: string
          shop_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          operation?: string
          order_id?: string | null
          quote_id?: string | null
          request_sha256: string
          response_payload: Json
          retained_until?: string
          shop_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          operation?: string
          order_id?: string | null
          quote_id?: string | null
          request_sha256?: string
          response_payload?: Json
          retained_until?: string
          shop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_mutations_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_mutations_quote_id_fkey"
            columns: ["quote_id"]
            referencedRelation: "customer_checkout_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_mutations_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      customer_order_outbox: {
        Row: {
          attempt_count: number
          available_at: string
          created_at: string
          delivered_at: string | null
          event_type: string
          id: string
          idempotency_key: string
          last_error_code: string | null
          lease_expires_at: string | null
          lease_session_id: string | null
          lease_token: string | null
          leased_by_device_id: string | null
          order_id: string
          payload: Json
          shop_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          created_at?: string
          delivered_at?: string | null
          event_type: string
          id?: string
          idempotency_key: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_session_id?: string | null
          lease_token?: string | null
          leased_by_device_id?: string | null
          order_id: string
          payload: Json
          shop_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          created_at?: string
          delivered_at?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_session_id?: string | null
          lease_token?: string | null
          leased_by_device_id?: string | null
          order_id?: string
          payload?: Json
          shop_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_outbox_lease_session_id_fkey"
            columns: ["lease_session_id"]
            referencedRelation: "pos_sessions"
            referencedColumns: ["pos_session_id"]
          },
          {
            foreignKeyName: "customer_order_outbox_leased_by_device_id_fkey"
            columns: ["leased_by_device_id"]
            referencedRelation: "shop_devices"
            referencedColumns: ["shop_device_id"]
          },
          {
            foreignKeyName: "customer_order_outbox_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_outbox_order_shop_fkey"
            columns: ["shop_id", "order_id"]
            referencedRelation: "customer_orders"
            referencedColumns: ["shop_id", "id"]
          },
        ]
      }
      customer_order_payments: {
        Row: {
          amount_clp: number
          created_at: string
          currency_code: string
          failure_code: string | null
          id: string
          method: string
          order_id: string
          provider_key: string
          provider_reference_sha256: string | null
          shop_id: string
          status: string
          status_version: number
          terminal_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_clp: number
          created_at?: string
          currency_code?: string
          failure_code?: string | null
          id?: string
          method: string
          order_id: string
          provider_key?: string
          provider_reference_sha256?: string | null
          shop_id: string
          status: string
          status_version?: number
          terminal_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_clp?: number
          created_at?: string
          currency_code?: string
          failure_code?: string | null
          id?: string
          method?: string
          order_id?: string
          provider_key?: string
          provider_reference_sha256?: string | null
          shop_id?: string
          status?: string
          status_version?: number
          terminal_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_payments_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_payments_order_shop_fkey"
            columns: ["shop_id", "order_id"]
            referencedRelation: "customer_orders"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "customer_order_payments_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      customer_order_pos_receipts: {
        Row: {
          ack_idempotency_key: string
          committed_status_version: number
          created_at: string
          expected_status_version: number
          handoff_id: string
          id: string
          lease_token: string
          order_id: string
          outcome: string
          pos_sale_id: string | null
          pos_session_id: string
          request_sha256: string
          response_payload: Json
          retained_until: string
          shop_device_id: string
          shop_id: string
          staff_id: string
        }
        Insert: {
          ack_idempotency_key: string
          committed_status_version: number
          created_at?: string
          expected_status_version: number
          handoff_id: string
          id?: string
          lease_token: string
          order_id: string
          outcome: string
          pos_sale_id?: string | null
          pos_session_id: string
          request_sha256: string
          response_payload: Json
          retained_until?: string
          shop_device_id: string
          shop_id: string
          staff_id: string
        }
        Update: {
          ack_idempotency_key?: string
          committed_status_version?: number
          created_at?: string
          expected_status_version?: number
          handoff_id?: string
          id?: string
          lease_token?: string
          order_id?: string
          outcome?: string
          pos_sale_id?: string | null
          pos_session_id?: string
          request_sha256?: string
          response_payload?: Json
          retained_until?: string
          shop_device_id?: string
          shop_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_pos_receipts_handoff_shop_fkey"
            columns: ["shop_id", "handoff_id"]
            referencedRelation: "customer_order_outbox"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "customer_order_pos_receipts_order_shop_fkey"
            columns: ["shop_id", "order_id"]
            referencedRelation: "customer_orders"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "customer_order_pos_receipts_pos_sale_id_fkey"
            columns: ["pos_sale_id"]
            referencedRelation: "pos_sales"
            referencedColumns: ["pos_sale_id"]
          },
          {
            foreignKeyName: "customer_order_pos_receipts_pos_session_id_fkey"
            columns: ["pos_session_id"]
            referencedRelation: "pos_sessions"
            referencedColumns: ["pos_session_id"]
          },
          {
            foreignKeyName: "customer_order_pos_receipts_shop_device_id_fkey"
            columns: ["shop_device_id"]
            referencedRelation: "shop_devices"
            referencedColumns: ["shop_device_id"]
          },
          {
            foreignKeyName: "customer_order_pos_receipts_staff_id_fkey"
            columns: ["staff_id"]
            referencedRelation: "staff_accounts"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "customer_order_pos_receipts_staff_id_fkey"
            columns: ["staff_id"]
            referencedRelation: "staff_accounts_safe"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      customer_order_status_events: {
        Row: {
          actor_kind: string
          created_at: string
          event_version: number
          id: string
          metadata_redacted: Json
          order_id: string
          shop_id: string
          status: string
        }
        Insert: {
          actor_kind?: string
          created_at?: string
          event_version: number
          id?: string
          metadata_redacted?: Json
          order_id: string
          shop_id: string
          status: string
        }
        Update: {
          actor_kind?: string
          created_at?: string
          event_version?: number
          id?: string
          metadata_redacted?: Json
          order_id?: string
          shop_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_status_events_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_status_events_order_shop_fkey"
            columns: ["shop_id", "order_id"]
            referencedRelation: "customer_orders"
            referencedColumns: ["shop_id", "id"]
          },
        ]
      }
      customer_orders: {
        Row: {
          cart_id: string | null
          currency_code: string
          delivery_fee_clp: number
          fulfillment_mode: string
          fulfillment_snapshot: Json
          id: string
          placed_at: string
          public_order_code: string
          quote_id: string | null
          quote_version: number
          shop_id: string
          slot_id: string
          status: string
          status_version: number
          subtotal_clp: number
          total_clp: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cart_id?: string | null
          currency_code?: string
          delivery_fee_clp?: number
          fulfillment_mode: string
          fulfillment_snapshot: Json
          id?: string
          placed_at?: string
          public_order_code?: string
          quote_id?: string | null
          quote_version: number
          shop_id: string
          slot_id: string
          status?: string
          status_version?: number
          subtotal_clp: number
          total_clp: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cart_id?: string | null
          currency_code?: string
          delivery_fee_clp?: number
          fulfillment_mode?: string
          fulfillment_snapshot?: Json
          id?: string
          placed_at?: string
          public_order_code?: string
          quote_id?: string | null
          quote_version?: number
          shop_id?: string
          slot_id?: string
          status?: string
          status_version?: number
          subtotal_clp?: number
          total_clp?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_orders_quote_id_fkey"
            columns: ["quote_id"]
            referencedRelation: "customer_checkout_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_orders_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "customer_orders_slot_fkey"
            columns: ["shop_id", "slot_id"]
            referencedRelation: "storefront_fulfillment_slots"
            referencedColumns: ["shop_id", "id"]
          },
        ]
      }
      customer_payment_attempts: {
        Row: {
          attempt_number: number
          created_at: string
          failure_code: string | null
          id: string
          idempotency_key: string
          payment_id: string
          provider_attempt_sha256: string | null
          provider_key: string
          request_sha256: string
          shop_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_number: number
          created_at?: string
          failure_code?: string | null
          id?: string
          idempotency_key: string
          payment_id: string
          provider_attempt_sha256?: string | null
          provider_key?: string
          request_sha256: string
          shop_id: string
          status: string
          updated_at?: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          failure_code?: string | null
          id?: string
          idempotency_key?: string
          payment_id?: string
          provider_attempt_sha256?: string | null
          provider_key?: string
          request_sha256?: string
          shop_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payment_attempts_payment_id_fkey"
            columns: ["payment_id"]
            referencedRelation: "customer_order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_attempts_payment_shop_fkey"
            columns: ["shop_id", "payment_id"]
            referencedRelation: "customer_order_payments"
            referencedColumns: ["shop_id", "id"]
          },
        ]
      }
      customer_payment_events: {
        Row: {
          created_at: string
          event_type: string
          event_version: number
          id: string
          metadata_redacted: Json
          occurred_at: string
          payment_id: string
          provider_event_id_sha256: string | null
          provider_key: string
          shop_id: string
          source: string
        }
        Insert: {
          created_at?: string
          event_type: string
          event_version: number
          id?: string
          metadata_redacted?: Json
          occurred_at: string
          payment_id: string
          provider_event_id_sha256?: string | null
          provider_key?: string
          shop_id: string
          source: string
        }
        Update: {
          created_at?: string
          event_type?: string
          event_version?: number
          id?: string
          metadata_redacted?: Json
          occurred_at?: string
          payment_id?: string
          provider_event_id_sha256?: string | null
          provider_key?: string
          shop_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payment_events_payment_id_fkey"
            columns: ["payment_id"]
            referencedRelation: "customer_order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_events_payment_shop_fkey"
            columns: ["shop_id", "payment_id"]
            referencedRelation: "customer_order_payments"
            referencedColumns: ["shop_id", "id"]
          },
        ]
      }
      customer_payment_mutations: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          operation: string
          order_id: string | null
          payment_id: string | null
          request_sha256: string
          response_payload: Json
          retained_until: string
          shop_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          operation: string
          order_id?: string | null
          payment_id?: string | null
          request_sha256: string
          response_payload: Json
          retained_until?: string
          shop_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          operation?: string
          order_id?: string | null
          payment_id?: string | null
          request_sha256?: string
          response_payload?: Json
          retained_until?: string
          shop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payment_mutations_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_mutations_payment_id_fkey"
            columns: ["payment_id"]
            referencedRelation: "customer_order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_mutations_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      customer_payment_webhook_receipts: {
        Row: {
          id: string
          occurred_at: string
          payload_sha256: string
          processed_at: string | null
          provider_event_id_sha256: string
          provider_key: string
          received_at: string
          signature_validated: boolean
          status: string
        }
        Insert: {
          id?: string
          occurred_at: string
          payload_sha256: string
          processed_at?: string | null
          provider_event_id_sha256: string
          provider_key: string
          received_at?: string
          signature_validated: boolean
          status: string
        }
        Update: {
          id?: string
          occurred_at?: string
          payload_sha256?: string
          processed_at?: string | null
          provider_event_id_sha256?: string
          provider_key?: string
          received_at?: string
          signature_validated?: boolean
          status?: string
        }
        Relationships: []
      }
      customer_product_review_events: {
        Row: {
          actor_kind: string
          created_at: string
          event_version: number
          id: string
          moderation_status: string
          reason: string | null
          review_id: string
          shop_id: string
        }
        Insert: {
          actor_kind: string
          created_at?: string
          event_version: number
          id?: string
          moderation_status: string
          reason?: string | null
          review_id: string
          shop_id: string
        }
        Update: {
          actor_kind?: string
          created_at?: string
          event_version?: number
          id?: string
          moderation_status?: string
          reason?: string | null
          review_id?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_product_review_events_review_id_fkey"
            columns: ["review_id"]
            referencedRelation: "customer_product_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_product_review_events_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      customer_product_reviews: {
        Row: {
          comment: string | null
          id: string
          moderated_at: string | null
          moderation_reason: string | null
          moderation_status: string
          order_id: string
          order_item_id: string
          publication_id: string
          rating: number
          shop_id: string
          submitted_at: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          comment?: string | null
          id?: string
          moderated_at?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          order_id: string
          order_item_id: string
          publication_id: string
          rating: number
          shop_id: string
          submitted_at?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          comment?: string | null
          id?: string
          moderated_at?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          order_id?: string
          order_item_id?: string
          publication_id?: string
          rating?: number
          shop_id?: string
          submitted_at?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_product_reviews_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_product_reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            referencedRelation: "customer_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_product_reviews_publication_id_fkey"
            columns: ["publication_id"]
            referencedRelation: "storefront_product_publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_product_reviews_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          locale: string
          privacy_consent_version: string | null
          privacy_consented_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          locale?: string
          privacy_consent_version?: string | null
          privacy_consented_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          locale?: string
          privacy_consent_version?: string | null
          privacy_consented_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_reorder_mutations: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          order_id: string
          request_sha256: string
          response_payload: Json
          retained_until: string
          shop_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          order_id: string
          request_sha256: string
          response_payload: Json
          retained_until?: string
          shop_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          order_id?: string
          request_sha256?: string
          response_payload?: Json
          retained_until?: string
          shop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_reorder_mutations_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_reorder_mutations_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      customer_reservation_hold_mutations: {
        Row: {
          created_at: string
          hold_id: string | null
          id: string
          idempotency_key: string
          operation: string
          request_sha256: string
          response_payload: Json
          retained_until: string
          shop_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hold_id?: string | null
          id?: string
          idempotency_key: string
          operation: string
          request_sha256: string
          response_payload: Json
          retained_until?: string
          shop_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          hold_id?: string | null
          id?: string
          idempotency_key?: string
          operation?: string
          request_sha256?: string
          response_payload?: Json
          retained_until?: string
          shop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_reservation_hold_mutations_hold_id_fkey"
            columns: ["hold_id"]
            referencedRelation: "customer_reservation_holds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_reservation_hold_mutations_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      customer_reservation_holds: {
        Row: {
          create_idempotency_key: string
          create_request_sha256: string
          created_at: string
          expires_at: string
          id: string
          publication_id: string
          quantity: number
          shop_id: string
          source_product_id: string
          status: string
          terminal_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          create_idempotency_key: string
          create_request_sha256: string
          created_at?: string
          expires_at: string
          id?: string
          publication_id: string
          quantity: number
          shop_id: string
          source_product_id: string
          status?: string
          terminal_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          create_idempotency_key?: string
          create_request_sha256?: string
          created_at?: string
          expires_at?: string
          id?: string
          publication_id?: string
          quantity?: number
          shop_id?: string
          source_product_id?: string
          status?: string
          terminal_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_reservation_holds_publication_fkey"
            columns: ["shop_id", "publication_id"]
            referencedRelation: "storefront_product_publications"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "customer_reservation_holds_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "customer_reservation_holds_source_product_id_fkey"
            columns: ["source_product_id"]
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_service_case_events: {
        Row: {
          actor_kind: string
          case_id: string
          created_at: string
          event_version: number
          id: string
          metadata_redacted: Json
          note_key: string | null
          shop_id: string
          status: string
        }
        Insert: {
          actor_kind: string
          case_id: string
          created_at?: string
          event_version: number
          id?: string
          metadata_redacted?: Json
          note_key?: string | null
          shop_id: string
          status: string
        }
        Update: {
          actor_kind?: string
          case_id?: string
          created_at?: string
          event_version?: number
          id?: string
          metadata_redacted?: Json
          note_key?: string | null
          shop_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_service_case_events_case_id_fkey"
            columns: ["case_id"]
            referencedRelation: "customer_service_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_case_events_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      customer_service_case_evidence: {
        Row: {
          byte_size: number | null
          case_id: string
          cleanup_claim_id: string | null
          cleanup_claimed_at: string | null
          created_at: string
          exif_removed: boolean
          height: number | null
          id: string
          mime_type: string | null
          object_path: string
          rejection_code: string | null
          scan_status: string
          scanned_at: string | null
          shop_id: string
          storage_deleted_at: string | null
          user_id: string
          width: number | null
        }
        Insert: {
          byte_size?: number | null
          case_id: string
          cleanup_claim_id?: string | null
          cleanup_claimed_at?: string | null
          created_at?: string
          exif_removed?: boolean
          height?: number | null
          id?: string
          mime_type?: string | null
          object_path: string
          rejection_code?: string | null
          scan_status?: string
          scanned_at?: string | null
          shop_id: string
          storage_deleted_at?: string | null
          user_id: string
          width?: number | null
        }
        Update: {
          byte_size?: number | null
          case_id?: string
          cleanup_claim_id?: string | null
          cleanup_claimed_at?: string | null
          created_at?: string
          exif_removed?: boolean
          height?: number | null
          id?: string
          mime_type?: string | null
          object_path?: string
          rejection_code?: string | null
          scan_status?: string
          scanned_at?: string | null
          shop_id?: string
          storage_deleted_at?: string | null
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_service_case_evidence_case_id_fkey"
            columns: ["case_id"]
            referencedRelation: "customer_service_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_case_evidence_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      customer_service_case_evidence_upload_tickets: {
        Row: {
          case_id: string
          cleanup_claim_id: string | null
          cleanup_claimed_at: string | null
          created_at: string
          expires_at: string
          extension: string
          id: string
          object_path: string
          shop_id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          case_id: string
          cleanup_claim_id?: string | null
          cleanup_claimed_at?: string | null
          created_at?: string
          expires_at?: string
          extension: string
          id?: string
          object_path: string
          shop_id: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          case_id?: string
          cleanup_claim_id?: string | null
          cleanup_claimed_at?: string | null
          created_at?: string
          expires_at?: string
          extension?: string
          id?: string
          object_path?: string
          shop_id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_service_case_evidence_upload_ticket_owner_fkey"
            columns: ["user_id", "shop_id", "case_id"]
            referencedRelation: "customer_service_cases"
            referencedColumns: ["user_id", "shop_id", "id"]
          },
          {
            foreignKeyName: "customer_service_case_evidence_upload_tickets_case_id_fkey"
            columns: ["case_id"]
            referencedRelation: "customer_service_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_case_evidence_upload_tickets_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      customer_service_case_lines: {
        Row: {
          case_id: string
          created_at: string
          id: string
          order_item_id: string
          quantity: number
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          order_item_id: string
          quantity: number
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          order_item_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_service_case_lines_case_id_fkey"
            columns: ["case_id"]
            referencedRelation: "customer_service_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_case_lines_order_item_id_fkey"
            columns: ["order_item_id"]
            referencedRelation: "customer_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_service_case_mutations: {
        Row: {
          case_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          operation: string
          request_sha256: string
          response_payload: Json
          retained_until: string
          shop_id: string
          user_id: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          operation: string
          request_sha256: string
          response_payload: Json
          retained_until?: string
          shop_id: string
          user_id: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          operation?: string
          request_sha256?: string
          response_payload?: Json
          retained_until?: string
          shop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_service_case_mutations_case_id_fkey"
            columns: ["case_id"]
            referencedRelation: "customer_service_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_case_mutations_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      customer_service_cases: {
        Row: {
          case_type: string
          closed_at: string | null
          customer_note: string | null
          id: string
          order_id: string
          public_case_code: string
          reason_key: string
          shop_id: string
          status: string
          submitted_at: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          case_type: string
          closed_at?: string | null
          customer_note?: string | null
          id?: string
          order_id: string
          public_case_code?: string
          reason_key: string
          shop_id: string
          status?: string
          submitted_at?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          case_type?: string
          closed_at?: string | null
          customer_note?: string | null
          id?: string
          order_id?: string
          public_case_code?: string
          reason_key?: string
          shop_id?: string
          status?: string
          submitted_at?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_service_cases_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_service_cases_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      storefront_catalog_items: {
        Row: {
          availability_mode: string
          catalog_version: number
          category_id: string
          category_name: string
          category_slug: string
          category_sort_rank: number
          compare_at_price_clp: number | null
          content_sha256: string
          delivery_enabled: boolean
          discount_bps: number | null
          featured: boolean
          image_card_url: string | null
          image_content_sha256: string | null
          image_detail_url: string | null
          image_thumb_url: string | null
          image_version_key: string | null
          pickup_enabled: boolean
          price_clp: number
          projected_at: string
          promotion_ends_at: string | null
          promotion_id: string | null
          promotion_name: string | null
          promotion_starts_at: string | null
          public_barcode: string | null
          public_brand: string | null
          public_description: string | null
          public_name: string
          public_search_aliases: string[]
          public_updated_at: string
          publication_id: string
          published_at: string
          reservation_enabled: boolean
          search_document: unknown
          search_text: string
          shop_delivery_enabled: boolean
          shop_id: string
          shop_pickup_enabled: boolean
          shop_reservation_enabled: boolean
          shop_slug: string
          sort_rank: number
          storefront_enabled: boolean
        }
        Insert: {
          availability_mode: string
          catalog_version: number
          category_id: string
          category_name: string
          category_slug: string
          category_sort_rank: number
          compare_at_price_clp?: number | null
          content_sha256: string
          delivery_enabled: boolean
          discount_bps?: number | null
          featured: boolean
          image_card_url?: string | null
          image_content_sha256?: string | null
          image_detail_url?: string | null
          image_thumb_url?: string | null
          image_version_key?: string | null
          pickup_enabled: boolean
          price_clp: number
          projected_at?: string
          promotion_ends_at?: string | null
          promotion_id?: string | null
          promotion_name?: string | null
          promotion_starts_at?: string | null
          public_barcode?: string | null
          public_brand?: string | null
          public_description?: string | null
          public_name: string
          public_search_aliases?: string[]
          public_updated_at: string
          publication_id: string
          published_at: string
          reservation_enabled: boolean
          search_document: unknown
          search_text: string
          shop_delivery_enabled: boolean
          shop_id: string
          shop_pickup_enabled: boolean
          shop_reservation_enabled: boolean
          shop_slug: string
          sort_rank: number
          storefront_enabled: boolean
        }
        Update: {
          availability_mode?: string
          catalog_version?: number
          category_id?: string
          category_name?: string
          category_slug?: string
          category_sort_rank?: number
          compare_at_price_clp?: number | null
          content_sha256?: string
          delivery_enabled?: boolean
          discount_bps?: number | null
          featured?: boolean
          image_card_url?: string | null
          image_content_sha256?: string | null
          image_detail_url?: string | null
          image_thumb_url?: string | null
          image_version_key?: string | null
          pickup_enabled?: boolean
          price_clp?: number
          projected_at?: string
          promotion_ends_at?: string | null
          promotion_id?: string | null
          promotion_name?: string | null
          promotion_starts_at?: string | null
          public_barcode?: string | null
          public_brand?: string | null
          public_description?: string | null
          public_name?: string
          public_search_aliases?: string[]
          public_updated_at?: string
          publication_id?: string
          published_at?: string
          reservation_enabled?: boolean
          search_document?: unknown
          search_text?: string
          shop_delivery_enabled?: boolean
          shop_id?: string
          shop_pickup_enabled?: boolean
          shop_reservation_enabled?: boolean
          shop_slug?: string
          sort_rank?: number
          storefront_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "storefront_catalog_items_category_fkey"
            columns: ["shop_id", "category_id"]
            referencedRelation: "storefront_categories"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "storefront_catalog_items_publication_fkey"
            columns: ["shop_id", "publication_id"]
            referencedRelation: "storefront_product_publications"
            referencedColumns: ["shop_id", "id"]
          },
        ]
      }
      storefront_catalog_versions: {
        Row: {
          catalog_version: number
          content_sha256: string
          item_count: number
          rebuilt_at: string | null
          shop_id: string
          updated_at: string
        }
        Insert: {
          catalog_version?: number
          content_sha256: string
          item_count?: number
          rebuilt_at?: string | null
          shop_id: string
          updated_at?: string
        }
        Update: {
          catalog_version?: number
          content_sha256?: string
          item_count?: number
          rebuilt_at?: string | null
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_catalog_versions_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      storefront_categories: {
        Row: {
          created_at: string
          id: string
          public_description: string | null
          public_name: string
          publication_status: string
          shop_id: string
          slug: string
          sort_rank: number
          source_category_id: string | null
          updated_at: string
          updated_by_profile_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          public_description?: string | null
          public_name: string
          publication_status?: string
          shop_id: string
          slug: string
          sort_rank?: number
          source_category_id?: string | null
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          public_description?: string | null
          public_name?: string
          publication_status?: string
          shop_id?: string
          slug?: string
          sort_rank?: number
          source_category_id?: string | null
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storefront_categories_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "storefront_categories_source_category_id_fkey"
            columns: ["source_category_id"]
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_categories_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      storefront_delivery_tracking_feed: {
        Row: {
          bearing_degrees: number | null
          contact_capability: string
          courier_public_label: string | null
          destination_latitude: number | null
          destination_longitude: number | null
          eta_ends_at: string | null
          eta_starts_at: string | null
          external_carrier: string | null
          external_tracking_code_masked: string | null
          external_tracking_url: string | null
          freshness: string
          fulfillment_mode: string
          horizontal_accuracy_meters: number | null
          latitude: number | null
          longitude: number | null
          observed_at: string | null
          order_id: string
          order_status: string
          order_status_version: number
          received_at: string | null
          server_time: string
          speed_meters_per_second: number | null
          store_latitude: number | null
          store_longitude: number | null
          tracking_mode: string
          tracking_session_id: string | null
          tracking_state: string
          vehicle_kind: string | null
          version: number
        }
        Insert: {
          bearing_degrees?: number | null
          contact_capability?: string
          courier_public_label?: string | null
          destination_latitude?: number | null
          destination_longitude?: number | null
          eta_ends_at?: string | null
          eta_starts_at?: string | null
          external_carrier?: string | null
          external_tracking_code_masked?: string | null
          external_tracking_url?: string | null
          freshness: string
          fulfillment_mode: string
          horizontal_accuracy_meters?: number | null
          latitude?: number | null
          longitude?: number | null
          observed_at?: string | null
          order_id: string
          order_status: string
          order_status_version: number
          received_at?: string | null
          server_time?: string
          speed_meters_per_second?: number | null
          store_latitude?: number | null
          store_longitude?: number | null
          tracking_mode: string
          tracking_session_id?: string | null
          tracking_state: string
          vehicle_kind?: string | null
          version?: number
        }
        Update: {
          bearing_degrees?: number | null
          contact_capability?: string
          courier_public_label?: string | null
          destination_latitude?: number | null
          destination_longitude?: number | null
          eta_ends_at?: string | null
          eta_starts_at?: string | null
          external_carrier?: string | null
          external_tracking_code_masked?: string | null
          external_tracking_url?: string | null
          freshness?: string
          fulfillment_mode?: string
          horizontal_accuracy_meters?: number | null
          latitude?: number | null
          longitude?: number | null
          observed_at?: string | null
          order_id?: string
          order_status?: string
          order_status_version?: number
          received_at?: string | null
          server_time?: string
          speed_meters_per_second?: number | null
          store_latitude?: number | null
          store_longitude?: number | null
          tracking_mode?: string
          tracking_session_id?: string | null
          tracking_state?: string
          vehicle_kind?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "storefront_delivery_tracking_feed_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_delivery_zone_communes: {
        Row: {
          commune: string
          created_at: string
          shop_id: string
          zone_id: string
        }
        Insert: {
          commune: string
          created_at?: string
          shop_id: string
          zone_id: string
        }
        Update: {
          commune?: string
          created_at?: string
          shop_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_delivery_zone_communes_zone_fkey"
            columns: ["shop_id", "zone_id"]
            referencedRelation: "storefront_delivery_zones"
            referencedColumns: ["shop_id", "id"]
          },
        ]
      }
      storefront_delivery_zones: {
        Row: {
          created_at: string
          enabled: boolean
          fee_clp: number
          id: string
          public_name: string
          region: string
          shop_id: string
          sort_rank: number
          updated_at: string
          updated_by_profile_id: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          fee_clp?: number
          id?: string
          public_name: string
          region: string
          shop_id: string
          sort_rank?: number
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          fee_clp?: number
          id?: string
          public_name?: string
          region?: string
          shop_id?: string
          sort_rank?: number
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storefront_delivery_zones_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "storefront_delivery_zones_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      storefront_fulfillment_slots: {
        Row: {
          capacity: number
          created_at: string
          delivery_zone_id: string | null
          enabled: boolean
          ends_at: string
          fulfillment_mode: string
          id: string
          pickup_point_id: string | null
          public_label: string
          shop_id: string
          starts_at: string
          updated_at: string
          updated_by_profile_id: string | null
        }
        Insert: {
          capacity: number
          created_at?: string
          delivery_zone_id?: string | null
          enabled?: boolean
          ends_at: string
          fulfillment_mode: string
          id?: string
          pickup_point_id?: string | null
          public_label: string
          shop_id: string
          starts_at: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Update: {
          capacity?: number
          created_at?: string
          delivery_zone_id?: string | null
          enabled?: boolean
          ends_at?: string
          fulfillment_mode?: string
          id?: string
          pickup_point_id?: string | null
          public_label?: string
          shop_id?: string
          starts_at?: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storefront_fulfillment_slots_pickup_fkey"
            columns: ["shop_id", "pickup_point_id"]
            referencedRelation: "storefront_pickup_points"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "storefront_fulfillment_slots_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "storefront_fulfillment_slots_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "storefront_fulfillment_slots_zone_fkey"
            columns: ["shop_id", "delivery_zone_id"]
            referencedRelation: "storefront_delivery_zones"
            referencedColumns: ["shop_id", "id"]
          },
        ]
      }
      storefront_image_publications: {
        Row: {
          card_url: string | null
          content_sha256: string | null
          content_type: string | null
          created_at: string
          detail_url: string | null
          height: number | null
          id: string
          publication_status: string
          published_at: string | null
          shop_id: string
          source_image_version_id: string | null
          source_product_id: string
          thumb_url: string | null
          updated_at: string
          updated_by_profile_id: string | null
          version_key: string
          width: number | null
        }
        Insert: {
          card_url?: string | null
          content_sha256?: string | null
          content_type?: string | null
          created_at?: string
          detail_url?: string | null
          height?: number | null
          id?: string
          publication_status?: string
          published_at?: string | null
          shop_id: string
          source_image_version_id?: string | null
          source_product_id: string
          thumb_url?: string | null
          updated_at?: string
          updated_by_profile_id?: string | null
          version_key: string
          width?: number | null
        }
        Update: {
          card_url?: string | null
          content_sha256?: string | null
          content_type?: string | null
          created_at?: string
          detail_url?: string | null
          height?: number | null
          id?: string
          publication_status?: string
          published_at?: string | null
          shop_id?: string
          source_image_version_id?: string | null
          source_product_id?: string
          thumb_url?: string | null
          updated_at?: string
          updated_by_profile_id?: string | null
          version_key?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "storefront_image_publications_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "storefront_image_publications_source_image_version_id_fkey"
            columns: ["source_image_version_id"]
            referencedRelation: "inventory_product_image_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_image_publications_source_product_id_fkey"
            columns: ["source_product_id"]
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_image_publications_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      storefront_payment_settings: {
        Row: {
          cash_on_delivery_enabled: boolean
          created_at: string
          online_payment_enabled: boolean
          online_provider: string
          pay_at_pickup_enabled: boolean
          revision: number
          shop_id: string
          updated_at: string
          updated_by_profile_id: string | null
        }
        Insert: {
          cash_on_delivery_enabled?: boolean
          created_at?: string
          online_payment_enabled?: boolean
          online_provider?: string
          pay_at_pickup_enabled?: boolean
          revision?: number
          shop_id: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Update: {
          cash_on_delivery_enabled?: boolean
          created_at?: string
          online_payment_enabled?: boolean
          online_provider?: string
          pay_at_pickup_enabled?: boolean
          revision?: number
          shop_id?: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storefront_payment_settings_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "storefront_payment_settings_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      storefront_pickup_points: {
        Row: {
          address_line_1: string
          address_line_2: string | null
          commune: string
          created_at: string
          enabled: boolean
          id: string
          public_instructions: string | null
          public_name: string
          region: string
          shop_id: string
          sort_rank: number
          updated_at: string
          updated_by_profile_id: string | null
        }
        Insert: {
          address_line_1: string
          address_line_2?: string | null
          commune: string
          created_at?: string
          enabled?: boolean
          id?: string
          public_instructions?: string | null
          public_name: string
          region: string
          shop_id: string
          sort_rank?: number
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Update: {
          address_line_1?: string
          address_line_2?: string | null
          commune?: string
          created_at?: string
          enabled?: boolean
          id?: string
          public_instructions?: string | null
          public_name?: string
          region?: string
          shop_id?: string
          sort_rank?: number
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storefront_pickup_points_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "storefront_pickup_points_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      storefront_product_publications: {
        Row: {
          availability_mode: string
          catalog_version: number
          compare_at_price_clp: number | null
          delivery_enabled: boolean
          featured: boolean
          id: string
          last_changed_fields: string[]
          last_correlation_id: string | null
          last_mutation_source: string
          pickup_enabled: boolean
          price_source_mode: string
          promotion_ends_at: string | null
          promotion_starts_at: string | null
          public_barcode: string | null
          public_brand: string | null
          public_category_id: string | null
          public_description: string | null
          public_name: string
          public_search_aliases: string[]
          publication_status: string
          published_at: string | null
          published_image_version_id: string | null
          reservation_enabled: boolean
          retail_price_clp: number
          shop_id: string
          sort_rank: number
          source_product_id: string
          updated_at: string
          updated_by_profile_id: string | null
        }
        Insert: {
          availability_mode?: string
          catalog_version?: number
          compare_at_price_clp?: number | null
          delivery_enabled?: boolean
          featured?: boolean
          id?: string
          last_changed_fields?: string[]
          last_correlation_id?: string | null
          last_mutation_source?: string
          pickup_enabled?: boolean
          price_source_mode?: string
          promotion_ends_at?: string | null
          promotion_starts_at?: string | null
          public_barcode?: string | null
          public_brand?: string | null
          public_category_id?: string | null
          public_description?: string | null
          public_name: string
          public_search_aliases?: string[]
          publication_status?: string
          published_at?: string | null
          published_image_version_id?: string | null
          reservation_enabled?: boolean
          retail_price_clp: number
          shop_id: string
          sort_rank?: number
          source_product_id: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Update: {
          availability_mode?: string
          catalog_version?: number
          compare_at_price_clp?: number | null
          delivery_enabled?: boolean
          featured?: boolean
          id?: string
          last_changed_fields?: string[]
          last_correlation_id?: string | null
          last_mutation_source?: string
          pickup_enabled?: boolean
          price_source_mode?: string
          promotion_ends_at?: string | null
          promotion_starts_at?: string | null
          public_barcode?: string | null
          public_brand?: string | null
          public_category_id?: string | null
          public_description?: string | null
          public_name?: string
          public_search_aliases?: string[]
          publication_status?: string
          published_at?: string | null
          published_image_version_id?: string | null
          reservation_enabled?: boolean
          retail_price_clp?: number
          shop_id?: string
          sort_rank?: number
          source_product_id?: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storefront_product_publications_category_fkey"
            columns: ["shop_id", "public_category_id"]
            referencedRelation: "storefront_categories"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "storefront_product_publications_image_fkey"
            columns: ["shop_id", "published_image_version_id"]
            referencedRelation: "storefront_image_publications"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "storefront_product_publications_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "storefront_product_publications_source_product_id_fkey"
            columns: ["source_product_id"]
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_product_publications_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      storefront_promotion_products: {
        Row: {
          created_at: string
          created_by_profile_id: string | null
          excluded: boolean
          promotion_id: string
          publication_id: string
          shop_id: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id?: string | null
          excluded?: boolean
          promotion_id: string
          publication_id: string
          shop_id: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string | null
          excluded?: boolean
          promotion_id?: string
          publication_id?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_promotion_products_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "storefront_promotion_products_promotion_fkey"
            columns: ["shop_id", "promotion_id"]
            referencedRelation: "storefront_promotions"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "storefront_promotion_products_publication_fkey"
            columns: ["shop_id", "publication_id"]
            referencedRelation: "storefront_product_publications"
            referencedColumns: ["shop_id", "id"]
          },
          {
            foreignKeyName: "storefront_promotion_products_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      storefront_promotions: {
        Row: {
          created_at: string
          discount_type: string
          discount_value: number
          ends_at: string
          id: string
          priority: number
          public_description: string | null
          public_name: string
          publication_status: string
          shop_id: string
          starts_at: string
          updated_at: string
          updated_by_profile_id: string | null
        }
        Insert: {
          created_at?: string
          discount_type: string
          discount_value: number
          ends_at: string
          id?: string
          priority?: number
          public_description?: string | null
          public_name: string
          publication_status?: string
          shop_id: string
          starts_at: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Update: {
          created_at?: string
          discount_type?: string
          discount_value?: number
          ends_at?: string
          id?: string
          priority?: number
          public_description?: string | null
          public_name?: string
          publication_status?: string
          shop_id?: string
          starts_at?: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storefront_promotions_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "storefront_promotions_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      storefront_review_aggregates: {
        Row: {
          average_rating: number
          distribution: Json
          publication_id: string
          published_count: number
          shop_id: string
          updated_at: string
        }
        Insert: {
          average_rating?: number
          distribution?: Json
          publication_id: string
          published_count?: number
          shop_id: string
          updated_at?: string
        }
        Update: {
          average_rating?: number
          distribution?: Json
          publication_id?: string
          published_count?: number
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_review_aggregates_publication_id_fkey"
            columns: ["publication_id"]
            referencedRelation: "storefront_product_publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_review_aggregates_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      storefront_settings: {
        Row: {
          availability_low_stock_threshold: number
          catalog_locale: string
          catalog_time_zone: string
          currency_code: string
          customer_order_cancellation_enabled: boolean
          customer_order_cancellation_window_minutes: number
          customer_order_push_enabled: boolean
          customer_review_edit_window_days: number
          default_page_size: number
          delivery_enabled: boolean
          delivery_tracking_enabled: boolean
          delivery_tracking_freshness_seconds: number
          delivery_tracking_min_distance_meters: number
          delivery_tracking_min_interval_seconds: number
          maximum_page_size: number
          pickup_enabled: boolean
          public_slug: string
          require_product_image: boolean
          reservation_enabled: boolean
          shop_id: string
          storefront_enabled: boolean
          updated_at: string
          updated_by_profile_id: string | null
        }
        Insert: {
          availability_low_stock_threshold?: number
          catalog_locale?: string
          catalog_time_zone?: string
          currency_code?: string
          customer_order_cancellation_enabled?: boolean
          customer_order_cancellation_window_minutes?: number
          customer_order_push_enabled?: boolean
          customer_review_edit_window_days?: number
          default_page_size?: number
          delivery_enabled?: boolean
          delivery_tracking_enabled?: boolean
          delivery_tracking_freshness_seconds?: number
          delivery_tracking_min_distance_meters?: number
          delivery_tracking_min_interval_seconds?: number
          maximum_page_size?: number
          pickup_enabled?: boolean
          public_slug: string
          require_product_image?: boolean
          reservation_enabled?: boolean
          shop_id: string
          storefront_enabled?: boolean
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Update: {
          availability_low_stock_threshold?: number
          catalog_locale?: string
          catalog_time_zone?: string
          currency_code?: string
          customer_order_cancellation_enabled?: boolean
          customer_order_cancellation_window_minutes?: number
          customer_order_push_enabled?: boolean
          customer_review_edit_window_days?: number
          default_page_size?: number
          delivery_enabled?: boolean
          delivery_tracking_enabled?: boolean
          delivery_tracking_freshness_seconds?: number
          delivery_tracking_min_distance_meters?: number
          delivery_tracking_min_interval_seconds?: number
          maximum_page_size?: number
          pickup_enabled?: boolean
          public_slug?: string
          require_product_image?: boolean
          reservation_enabled?: boolean
          shop_id?: string
          storefront_enabled?: boolean
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storefront_settings_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "storefront_settings_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
    }
    Views: {
      pos_revenue_daily_summary_v: {
        Row: {
          business_date: string | null
          card_received_clp: number | null
          cash_received_clp: number | null
          change_given_clp: number | null
          discounts_clp: number | null
          documented_revenue_clp: number | null
          gross_sales_clp: number | null
          latest_ledger_at: string | null
          net_revenue_clp: number | null
          other_received_clp: number | null
          refund_count: number | null
          refunds_clp: number | null
          sale_count: number | null
          shop_id: string | null
          stock_warning_count: number | null
          transaction_count: number | null
          transfer_received_clp: number | null
          verification_revenue_clp: number | null
          void_count: number | null
        }
        Insert: {
          business_date?: string | null
          card_received_clp?: number | null
          cash_received_clp?: number | null
          change_given_clp?: number | null
          discounts_clp?: number | null
          documented_revenue_clp?: number | null
          gross_sales_clp?: number | null
          latest_ledger_at?: string | null
          net_revenue_clp?: number | null
          other_received_clp?: number | null
          refund_count?: number | null
          refunds_clp?: number | null
          sale_count?: number | null
          shop_id?: string | null
          stock_warning_count?: number | null
          transaction_count?: number | null
          transfer_received_clp?: number | null
          verification_revenue_clp?: number | null
          void_count?: number | null
        }
        Update: {
          business_date?: string | null
          card_received_clp?: number | null
          cash_received_clp?: number | null
          change_given_clp?: number | null
          discounts_clp?: number | null
          documented_revenue_clp?: number | null
          gross_sales_clp?: number | null
          latest_ledger_at?: string | null
          net_revenue_clp?: number | null
          other_received_clp?: number | null
          refund_count?: number | null
          refunds_clp?: number | null
          sale_count?: number | null
          shop_id?: string | null
          stock_warning_count?: number | null
          transaction_count?: number | null
          transfer_received_clp?: number | null
          verification_revenue_clp?: number | null
          void_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_revenue_ledger_entries_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      pos_revenue_monthly_summary_v: {
        Row: {
          card_received_clp: number | null
          cash_received_clp: number | null
          change_given_clp: number | null
          discounts_clp: number | null
          documented_revenue_clp: number | null
          gross_sales_clp: number | null
          latest_ledger_at: string | null
          month_start: string | null
          net_revenue_clp: number | null
          other_received_clp: number | null
          refund_count: number | null
          refunds_clp: number | null
          sale_count: number | null
          shop_id: string | null
          stock_warning_count: number | null
          transaction_count: number | null
          transfer_received_clp: number | null
          verification_revenue_clp: number | null
          void_count: number | null
        }
        Insert: {
          card_received_clp?: number | null
          cash_received_clp?: number | null
          change_given_clp?: number | null
          discounts_clp?: number | null
          documented_revenue_clp?: number | null
          gross_sales_clp?: number | null
          latest_ledger_at?: string | null
          month_start?: string | null
          net_revenue_clp?: number | null
          other_received_clp?: number | null
          refund_count?: number | null
          refunds_clp?: number | null
          sale_count?: number | null
          shop_id?: string | null
          stock_warning_count?: number | null
          transaction_count?: number | null
          transfer_received_clp?: number | null
          verification_revenue_clp?: number | null
          void_count?: number | null
        }
        Update: {
          card_received_clp?: number | null
          cash_received_clp?: number | null
          change_given_clp?: number | null
          discounts_clp?: number | null
          documented_revenue_clp?: number | null
          gross_sales_clp?: number | null
          latest_ledger_at?: string | null
          month_start?: string | null
          net_revenue_clp?: number | null
          other_received_clp?: number | null
          refund_count?: number | null
          refunds_clp?: number | null
          sale_count?: number | null
          shop_id?: string | null
          stock_warning_count?: number | null
          transaction_count?: number | null
          transfer_received_clp?: number | null
          verification_revenue_clp?: number | null
          void_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_revenue_ledger_entries_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
      shared_sheet_session_diagnostics: {
        Row: {
          category: string
          column_count: number
          complete_count: number
          complete_rows: number
          data_rows: number
          data_summary: string
          deleted_at: string | null
          display_name: string
          editable_rows: number
          is_manual_entry: boolean
          item_rows: number
          missing_count: number
          owner_user_id: string
          overlay_bytes: number
          overlay_schema: number | null
          overlay_status: string
          overlay_summary: string
          payload_version: number
          remote_id: string
          shop_id: string | null
          supplier: string
          timestamp: string
          updated_at: string
        }
        Insert: {
          category?: string
          column_count?: number
          complete_count?: number
          complete_rows?: number
          data_rows?: number
          data_summary?: string
          deleted_at?: string | null
          display_name?: string
          editable_rows?: number
          is_manual_entry?: boolean
          item_rows?: number
          missing_count?: number
          owner_user_id?: string
          overlay_bytes?: number
          overlay_schema?: number | null
          overlay_status?: string
          overlay_summary?: string
          payload_version?: number
          remote_id?: string
          shop_id?: string | null
          supplier?: string
          timestamp?: string
          updated_at?: string
        }
        Update: {
          category?: string
          column_count?: number
          complete_count?: number
          complete_rows?: number
          data_rows?: number
          data_summary?: string
          deleted_at?: string | null
          display_name?: string
          editable_rows?: number
          is_manual_entry?: boolean
          item_rows?: number
          missing_count?: number
          owner_user_id?: string
          overlay_bytes?: number
          overlay_schema?: number | null
          overlay_status?: string
          overlay_summary?: string
          payload_version?: number
          remote_id?: string
          shop_id?: string | null
          supplier?: string
          timestamp?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_accounts_safe: {
        Row: {
          created_at: string | null
          credential_expires_at: string | null
          credential_kind: string | null
          credential_status: string | null
          credential_updated_at: string | null
          credential_version: number | null
          display_name: string | null
          failed_attempts: number | null
          last_login_at: string | null
          locked_until: string | null
          must_change_credential: boolean | null
          role_key: string | null
          session_invalidated_at: string | null
          shop_id: string | null
          staff_code: string | null
          staff_id: string | null
          status: string | null
          updated_at: string | null
          web_access_revoked_at: string | null
        }
        Insert: {
          created_at?: string | null
          credential_expires_at?: string | null
          credential_kind?: string | null
          credential_status?: string | null
          credential_updated_at?: string | null
          credential_version?: number | null
          display_name?: string | null
          failed_attempts?: number | null
          last_login_at?: string | null
          locked_until?: string | null
          must_change_credential?: boolean | null
          role_key?: string | null
          session_invalidated_at?: string | null
          shop_id?: string | null
          staff_code?: string | null
          staff_id?: string | null
          status?: string | null
          updated_at?: string | null
          web_access_revoked_at?: string | null
        }
        Update: {
          created_at?: string | null
          credential_expires_at?: string | null
          credential_kind?: string | null
          credential_status?: string | null
          credential_updated_at?: string | null
          credential_version?: number | null
          display_name?: string | null
          failed_attempts?: number | null
          last_login_at?: string | null
          locked_until?: string | null
          must_change_credential?: boolean | null
          role_key?: string | null
          session_invalidated_at?: string | null
          shop_id?: string | null
          staff_code?: string | null
          staff_id?: string | null
          status?: string | null
          updated_at?: string | null
          web_access_revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_accounts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["shop_id"]
          },
        ]
      }
    }
    Functions: {
      admin_sync_event_read_v1: {
        Args: {
          p_domains?: string[] | null
          p_event_id?: string | null
          p_limit?: number
          p_owner_user_id?: string | null
          p_shop_id?: string | null
        }
        Returns: Json
      }
      product_image_create_intent: {
        Args: {
          p_actor_kind: string
          p_actor_profile_id: string
          p_main_bytes: number
          p_main_height: number
          p_main_sha256: string
          p_main_width: number
          p_product_id: string
          p_shop_id: string
          p_thumb_bytes: number
          p_thumb_height: number
          p_thumb_sha256: string
          p_thumb_width: number
        }
        Returns: Json
      }
      product_image_create_intent_wechat_v1: {
        Args: {
          p_actor_profile_id: string
          p_correlation_id: string
          p_idempotency_key: string
          p_main_bytes: number
          p_main_height: number
          p_main_sha256: string
          p_main_width: number
          p_product_id: string
          p_shop_id: string
          p_thumb_bytes: number
          p_thumb_height: number
          p_thumb_sha256: string
          p_thumb_width: number
        }
        Returns: Json
      }
      product_image_fail_version: {
        Args: {
          p_actor_kind: string
          p_actor_profile_id: string
          p_error_code: string
          p_product_id: string
          p_shop_id: string
          p_version_id: string
        }
        Returns: Json
      }
      product_image_finalize: {
        Args: {
          p_actor_kind: string
          p_actor_profile_id: string
          p_main_bytes: number
          p_main_height: number
          p_main_sha256: string
          p_main_width: number
          p_product_id: string
          p_shop_id: string
          p_thumb_bytes: number
          p_thumb_height: number
          p_thumb_sha256: string
          p_thumb_width: number
          p_version_id: string
        }
        Returns: Json
      }
      product_image_record_cleanup: {
        Args: {
          p_actor_kind: string
          p_actor_profile_id: string
          p_error_code?: string
          p_product_id: string
          p_shop_id: string
          p_source?: string
          p_success: boolean
          p_version_id: string
        }
        Returns: Json
      }
      product_image_record_denied: {
        Args: {
          p_actor_kind: string
          p_actor_profile_id: string
          p_code: string
          p_operation: string
          p_product_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      product_image_remove: {
        Args: {
          p_actor_kind: string
          p_actor_profile_id: string
          p_expected_version_id: string
          p_product_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      product_image_revalidate_access_v1: {
        Args: {
          p_actor_kind: string
          p_actor_profile_id: string
          p_permission: string
          p_shop_id: string
        }
        Returns: boolean
      }
      product_image_resolve_read_paths: {
        Args: {
          p_actor_kind: string
          p_actor_profile_id: string
          p_refs: Json
          p_shop_id: string
        }
        Returns: Json
      }
      record_staff_credential_failure: {
        Args: {
          p_lockout_attempts?: number
          p_lockout_seconds?: number
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      record_staff_web_login_failure: {
        Args: {
          p_attempt_key_hash: string
          p_lockout_attempts?: number
          p_lockout_seconds?: number
          p_metadata_redacted?: Json
        }
        Returns: Json
      }
      staff_web_login_commit_v1: {
        Args: {
          p_attempt_key_hash: string
          p_expected_credential_version: number
          p_expires_at: string
          p_metadata_redacted?: Json
          p_session_token_hash: string
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      staff_web_catalog_mutate_v1: {
        Args: {
          p_expected_credential_version: number
          p_operation: string
          p_payload: Json
          p_session_token_hash: string
          p_shop_id: string
          p_staff_id: string
          p_staff_web_session_id: string
        }
        Returns: Json
      }
      staff_web_catalog_update_product_if_revision_v1: {
        Args: {
          p_expected_credential_version: number
          p_expected_updated_at: string
          p_payload: Json
          p_session_token_hash: string
          p_shop_id: string
          p_staff_id: string
          p_staff_web_session_id: string
        }
        Returns: Json
      }
      admin_catalog_import_receipt_claim_v1: {
        Args: {
          p_actor_id: string
          p_actor_kind: string
          p_request_fingerprint: string
          p_request_key: string
          p_shop_id: string
        }
        Returns: Json
      }
      admin_catalog_import_receipt_lookup_v1: {
        Args: {
          p_actor_id: string
          p_actor_kind: string
          p_request_fingerprint: string
          p_request_key: string
          p_shop_id: string
        }
        Returns: Json
      }
      admin_catalog_import_receipt_complete_v1: {
        Args: {
          p_claim_token: string
          p_receipt_id: string
          p_request_fingerprint: string
          p_result: Json
        }
        Returns: Json
      }
      staff_web_catalog_set_product_archived_if_revision_v1: {
        Args: {
          p_archived: boolean
          p_expected_credential_version: number
          p_expected_updated_at: string
          p_payload: Json
          p_session_token_hash: string
          p_shop_id: string
          p_staff_id: string
          p_staff_web_session_id: string
        }
        Returns: Json
      }
      staff_web_lifecycle_mutate_v1: {
        Args: {
          p_expected_credential_version?: number | null
          p_operation: string
          p_payload: Json
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
        }
        Returns: Json
      }
      staff_web_audit_event_v1: {
        Args: {
          p_code: string
          p_event_key: string
          p_expected_credential_version: number
          p_metadata: Json
          p_required_permission: string
          p_result: string
          p_session_token_hash: string
          p_severity: string
          p_shop_id: string
          p_staff_id: string
          p_staff_web_session_id: string
          p_target_id: string | null
          p_target_type: string
        }
        Returns: Json
      }
      staff_web_history_mutate_v1: {
        Args: {
          p_expected_credential_version: number | null
          p_operation: string
          p_payload: Json
          p_session_token_hash: string | null
          p_shop_id: string
          p_staff_id: string | null
          p_staff_web_session_id: string | null
        }
        Returns: Json
      }
      staff_web_login_failure_v1: {
        Args: {
          p_affect_staff?: boolean
          p_attempt_key_hash: string
          p_code: string
          p_expected_credential_version?: number | null
          p_metadata_redacted: Json
          p_shop_id?: string | null
          p_staff_id?: string | null
        }
        Returns: Json
      }
      staff_web_login_lookup_v1: {
        Args: {
          p_attempt_key_hash: string
          p_shop_code: string
          p_staff_code: string
        }
        Returns: Json
      }
      staff_web_session_resolve_v1: {
        Args: {
          p_session_token_hash: string
        }
        Returns: Json
      }
      staff_web_session_revoke_v1: {
        Args: {
          p_reason: string
          p_record_logout?: boolean
          p_session_token_hash: string
        }
        Returns: boolean
      }
      pos_article_mutation_apply_v1: {
        Args: {
          p_app_version: string
          p_expected_credential_version: number
          p_mutation: Json
          p_payload_hash: string
          p_pos_session_id: string
          p_schema_version: string
          p_shop_device_id: string
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      pos_article_mutation_cleanup_synthetic_v1: {
        Args: {
          p_run_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      pos_catalog_import_apply_v1: {
        Args: {
          p_batch_created_at: string
          p_client_import_id: string
          p_idempotency_key: string
          p_items: Json
          p_metadata_redacted?: Json
          p_owner_user_id: string
          p_payload_hash: string
          p_pos_session_id: string
          p_schema_version: string
          p_shop_device_id: string
          p_shop_id: string
          p_source: string
          p_staff_id: string
          p_summary?: Json
        }
        Returns: Json
      }
      pos_catalog_pull_page_v2: {
        Args: {
          p_after_id: string | null
          p_after_updated_at: string | null
          p_entity: string | null
          p_expected_revision: string | null
          p_expected_scope_key: string | null
          p_expected_scope_kind: string | null
          p_include_manifest: boolean
          p_limit: number
          p_lower_bound: string | null
          p_mode: string
          p_shop_id: string
          p_snapshot_at: string | null
        }
        Returns: Json
      }
      pos_catalog_pull_page_for_lease_v3: {
        Args: {
          p_after_id: string | null
          p_after_updated_at: string | null
          p_entity: string | null
          p_expected_revision: string | null
          p_expected_scope_key: string | null
          p_expected_scope_kind: string | null
          p_include_manifest: boolean
          p_limit: number
          p_lower_bound: string | null
          p_mode: string
          p_pos_session_id: string
          p_shop_device_id: string
          p_shop_id: string
          p_snapshot_at: string | null
          p_staff_id: string
        }
        Returns: Json
      }
      pos_catalog_revision_v2: {
        Args: {
          p_shop_id: string
        }
        Returns: Json
      }
      pos_catalog_revision_for_lease_v3: {
        Args: {
          p_pos_session_id: string
          p_shop_device_id: string
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      pos_catalog_import_scope_v1: {
        Args: {
          p_shop_device_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      pos_catalog_import_correct_v1: {
        Args: {
          p_shop_id: string
          p_shop_device_id: string
          p_staff_id: string
          p_pos_session_id: string
          p_owner_user_id: string
          p_original_client_import_id: string
          p_original_idempotency_key: string
          p_original_payload_hash: string
          p_client_import_id: string
          p_idempotency_key: string
          p_payload_hash: string
          p_created_at: string
          p_items: Json
        }
        Returns: Json
      }
      pos_catalog_import_recovery_v1: {
        Args: {
          p_shop_id: string
          p_shop_device_id: string
          p_staff_id: string
          p_pos_session_id: string
          p_owner_user_id: string
          p_action: string
          p_payload: Json
        }
        Returns: Json
      }
      pos_catalog_import_receipt_v1: {
        Args: {
          p_shop_id: string
          p_shop_device_id: string
          p_staff_id: string
          p_pos_session_id: string
          p_owner_user_id: string
          p_client_import_id: string
          p_idempotency_key: string
          p_payload_hash: string
        }
        Returns: Json
      }
      pos_catalog_import_retire_v1: {
        Args: {
          p_shop_id: string
          p_shop_device_id: string
          p_staff_id: string
          p_pos_session_id: string
          p_owner_user_id: string
          p_client_import_id: string
          p_idempotency_key: string
          p_payload_hash: string
        }
        Returns: Json
      }
      pos_catalog_import_apply_v2: {
        Args: {
          p_batch_created_at: string
          p_client_import_id: string
          p_idempotency_key: string
          p_items: Json
          p_metadata_redacted?: Json
          p_owner_user_id: string
          p_payload_hash: string
          p_pos_session_id: string
          p_schema_version: string
          p_shop_device_id: string
          p_shop_id: string
          p_source: string
          p_staff_id: string
          p_summary?: Json
        }
        Returns: Json
      }
      pos_product_image_authorize_v1: {
        Args: {
          p_expected_staff_credential_version: number
          p_permission: string
          p_pos_session_id: string
          p_shop_device_id: string
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      pos_product_image_cleanup_result_v1: {
        Args: {
          p_app_version: string
          p_error_code: string | null
          p_expected_staff_credential_version: number
          p_idempotency_key: string
          p_operation: string
          p_operation_id: string
          p_payload_hash: string
          p_pos_session_id: string
          p_product_id: string
          p_schema_version: string
          p_shop_device_id: string
          p_shop_id: string
          p_staff_id: string
          p_success: boolean
          p_version_id: string
        }
        Returns: Json
      }
      pos_product_image_finalize_commit_v1: {
        Args: {
          p_app_version: string
          p_expected_current_version_id: string | null
          p_expected_staff_credential_version: number
          p_idempotency_key: string
          p_operation_id: string
          p_payload_hash: string
          p_pos_session_id: string
          p_product_id: string
          p_schema_version: string
          p_shop_device_id: string
          p_shop_id: string
          p_staff_id: string
          p_validation_code: string | null
          p_validation_ok: boolean
          p_verified_main: Json | null
          p_verified_thumb: Json | null
          p_version_id: string
        }
        Returns: Json
      }
      pos_product_image_finalize_prepare_v1: {
        Args: {
          p_app_version: string
          p_expected_current_version_id: string | null
          p_expected_staff_credential_version: number
          p_idempotency_key: string
          p_operation_id: string
          p_payload_hash: string
          p_pos_session_id: string
          p_product_id: string
          p_schema_version: string
          p_shop_device_id: string
          p_shop_id: string
          p_staff_id: string
          p_version_id: string
        }
        Returns: Json
      }
      pos_product_image_intent_v1: {
        Args: {
          p_app_version: string
          p_expected_current_version_id: string | null
          p_expected_staff_credential_version: number
          p_idempotency_key: string
          p_main_metadata: Json
          p_operation_id: string
          p_payload_hash: string
          p_pos_session_id: string
          p_product_id: string
          p_schema_version: string
          p_shop_device_id: string
          p_shop_id: string
          p_staff_id: string
          p_thumb_metadata: Json
        }
        Returns: Json
      }
      pos_product_image_node_audit_admit_v1: {
        Args: {
          p_expected_staff_credential_version: number
          p_permission: string
          p_pos_session_id: string
          p_shop_device_id: string
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      pos_product_image_read_authorize_v1: {
        Args: {
          p_app_version: string
          p_expected_staff_credential_version: number
          p_pos_session_id: string
          p_schema_version: string
          p_shop_device_id: string
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      pos_product_image_read_resolve_v1: {
        Args: {
          p_app_version: string
          p_expected_staff_credential_version: number
          p_pos_session_id: string
          p_refs: Json
          p_schema_version: string
          p_shop_device_id: string
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      pos_product_image_remove_v1: {
        Args: {
          p_app_version: string
          p_expected_current_version_id: string
          p_expected_staff_credential_version: number
          p_idempotency_key: string
          p_operation_id: string
          p_payload_hash: string
          p_pos_session_id: string
          p_product_id: string
          p_schema_version: string
          p_shop_device_id: string
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      task_149_pos_product_image_fixture_cleanup_v1: {
        Args: {
          p_action: string
          p_operation_ids: string[]
          p_product_id: string | null
          p_run_id: string
          p_shop_id: string | null
        }
        Returns: Json
      }
      pos_runtime_audit_write_v1: {
        Args: {
          p_code: string
          p_event_key: string
          p_metadata_redacted?: Json
          p_result: string
          p_severity: string
          p_shop_id?: string | null
          p_staff_id?: string | null
          p_target_id?: string | null
          p_target_type?: string | null
        }
        Returns: string
      }
      pos_runtime_first_login_commit_v1: {
        Args: {
          p_app_version: string
          p_device_display_name: string
          p_device_expires_at: string
          p_device_identifier: string
          p_device_token_hash: string
          p_expected_credential_version: number
          p_metadata_redacted?: Json
          p_session_expires_at: string
          p_session_token_hash: string
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      pos_runtime_first_login_commit_v2: {
        Args: {
          p_app_version: string
          p_device_display_name: string
          p_device_identifier: string
          p_device_token_hash: string
          p_device_ttl_seconds: number
          p_expected_credential_version: number
          p_metadata_redacted?: Json
          p_session_token_hash: string
          p_session_ttl_seconds: number
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      pos_runtime_first_login_commit_v3: {
        Args: {
          p_app_version: string
          p_device_display_name: string
          p_device_identifier: string
          p_device_token_hash: string
          p_device_ttl_seconds: number
          p_expected_credential_version: number
          p_metadata_redacted?: Json
          p_offline_authorization_max_age_seconds: number
          p_offline_authorization_policy_version: string
          p_session_token_hash: string
          p_session_ttl_seconds: number
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      pos_runtime_first_login_failure_v1: {
        Args: {
          p_expected_credential_version: number
          p_lockout_attempts: number
          p_lockout_seconds: number
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      pos_runtime_first_login_lookup_v1: {
        Args: {
          p_device_identifier: string
          p_shop_code: string
          p_staff_code: string
        }
        Returns: Json
      }
      pos_runtime_heartbeat_touch_v1: {
        Args: {
          p_app_version: string
          p_expires_at: string
          p_pos_session_id: string
          p_shop_device_id: string
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      pos_runtime_lease_v1: {
        Args: {
          p_pos_session_id: string
          p_shop_device_id: string
        }
        Returns: Json
      }
      pos_runtime_lease_publish_success_v1: {
        Args: {
          p_pos_session_id: string
          p_publication_kind: string
          p_shop_device_id: string
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      pos_runtime_lease_publish_success_v2: {
        Args: {
          p_expected_catalog_revision?: string | null
          p_expected_catalog_scope_key?: string | null
          p_pos_session_id: string
          p_publication_kind: string
          p_shop_device_id: string
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      pos_runtime_mark_session_v1: {
        Args: {
          p_pos_session_id: string
          p_reason: string
          p_status: string
        }
        Returns: boolean
      }
      pos_customer_order_ack_v1: {
        Args: {
          p_ack_idempotency_key: string
          p_expected_status_version: number
          p_handoff_id: string
          p_lease_token: string
          p_outcome: string
          p_pos_sale_id?: string | null
          p_pos_session_id: string
          p_shop_device_id: string
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      pos_customer_order_claim_v1: {
        Args: {
          p_limit?: number
          p_pos_session_id: string
          p_shop_device_id: string
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      pos_apply_sale_stock_movement: {
        Args: {
          p_metadata_redacted?: Json
          p_movement_key: string
          p_movement_kind: string
          p_pos_sale_id: string
          p_pos_sale_line_id: string | null
          p_product_id: string | null
          p_quantity_delta: number
          p_shop_id: string
        }
        Returns: {
          issue_code: string | null
          status: string
          stock_after: number | null
          stock_before: number | null
        }[]
      }
      pos_sales_sync_apply_v1: {
        Args: {
          p_client_batch_id: string
          p_idempotency_key: string
          p_metadata_redacted?: Json
          p_payload_hash: string
          p_pos_session_id: string
          p_sales: Json
          p_schema_version: string
          p_shop_code: string
          p_shop_device_id: string
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      platform_create_pos_first_shop: {
        Args: {
          p_business_address: string
          p_business_city: string
          p_business_giro: string
          p_company_rut: string
          p_legal_representative_rut: string
          p_reason: string
          p_shop_code: string
          p_shop_name: string
          p_staff_credential_hash: string
          p_staff_display_name: string
        }
        Returns: Json
      }
      platform_create_shop: {
        Args: {
          p_owner_profile_id: string
          p_reason: string
          p_shop_code: string
          p_shop_name: string
        }
        Returns: Json
      }
      platform_map_shop_inventory_source: {
        Args: {
          p_owner_user_id: string
          p_reason: string
          p_shop_id: string
        }
        Returns: Json
      }
      platform_create_shop_with_owner_bootstrap: {
        Args: {
          p_business_address: string
          p_business_city: string
          p_business_giro: string
          p_company_rut: string
          p_legal_representative_rut: string
          p_owner_profile_id: string
          p_reason: string
          p_shop_code: string
          p_shop_name: string
          p_staff_credential_hash: string
          p_staff_display_name: string
        }
        Returns: Json
      }
      platform_create_shop_with_pending_owner_invite:
        | {
            Args: {
              p_owner_email: string
              p_reason: string
              p_shop_code: string
              p_shop_name: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_business_address: string
              p_business_city: string
              p_business_giro: string
              p_company_rut: string
              p_legal_representative_rut: string
              p_owner_email: string
              p_reason: string
              p_shop_code: string
              p_shop_name: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_business_address: string
              p_business_city: string
              p_business_giro: string
              p_company_rut: string
              p_legal_representative_rut: string
              p_owner_email: string
              p_reason: string
              p_shop_code: string
              p_shop_name: string
              p_staff_credential_hash: string
              p_staff_display_name: string
            }
            Returns: Json
          }
      platform_emergency_revoke_device: {
        Args: {
          p_confirmation: string
          p_reason: string
          p_shop_device_id: string
        }
        Returns: Json
      }
      platform_activate_shop: {
        Args: {
          p_reason: string
          p_shop_code_confirmation: string
          p_shop_id: string
        }
        Returns: Json
      }
      platform_assign_shop_member: {
        Args: {
          p_profile_id: string
          p_reason: string
          p_role_key: string
          p_shop_code_confirmation: string
          p_shop_id: string
        }
        Returns: Json
      }
      platform_force_purge_test_shop: {
        Args: {
          p_confirmation: string
          p_reason: string
          p_shop_id: string
        }
        Returns: Json
      }
      platform_grant_platform_admin: {
        Args: { p_confirmation: string; p_profile_id: string; p_reason: string }
        Returns: Json
      }
      platform_preview_shop_purge: {
        Args: { p_shop_id: string }
        Returns: Json
      }
      platform_purge_shop: {
        Args: {
          p_confirmation: string
          p_reason: string
          p_shop_id: string
        }
        Returns: Json
      }
      platform_reactivate_shop: {
        Args: { p_confirmation: string; p_reason: string; p_shop_id: string }
        Returns: Json
      }
      platform_recover_initial_manager_1001: {
        Args: {
          p_reason: string
          p_shop_code: string
          p_shop_id: string
          p_staff_credential_hash: string
          p_staff_display_name: string
        }
        Returns: Json
      }
      platform_restore_shop: {
        Args: {
          p_reason: string
          p_shop_code_confirmation: string
          p_shop_id: string
        }
        Returns: Json
      }
      platform_revoke_platform_admin: {
        Args: { p_confirmation: string; p_profile_id: string; p_reason: string }
        Returns: Json
      }
      platform_revoke_shop_member: {
        Args: {
          p_reason: string
          p_shop_code_confirmation: string
          p_shop_id: string
          p_shop_member_id: string
        }
        Returns: Json
      }
      platform_soft_delete_shop: {
        Args: {
          p_reason: string
          p_shop_code_confirmation: string
          p_shop_id: string
        }
        Returns: Json
      }
      platform_suspend_shop: {
        Args: { p_confirmation: string; p_reason: string; p_shop_id: string }
        Returns: Json
      }
      platform_update_shop_profile: {
        Args: {
          p_business_address: string
          p_business_city: string
          p_business_giro: string
          p_company_rut: string
          p_confirmation: string
          p_legal_representative_rut: string
          p_reason: string
          p_shop_id: string
          p_shop_name: string
        }
        Returns: Json
      }
      record_sync_event: {
        Args: {
          p_batch_id?: string
          p_changed_count?: number
          p_client_event_id?: string
          p_domain: string
          p_entity_ids?: Json
          p_event_type: string
          p_metadata?: Json
          p_shop_id?: string
          p_source?: string
          p_source_device_id?: string
          p_store_id?: string
        }
        Returns: Database["public"]["Tables"]["sync_events"]["Row"]
      }
      record_sync_event_v6: {
        Args: {
          p_batch_id?: string
          p_changed_count?: number
          p_client_event_id?: string
          p_domain: string
          p_entity_ids?: Json
          p_event_type: string
          p_metadata?: Json
          p_shop_id?: string
          p_source?: string
          p_source_device_id?: string
          p_store_id?: string
        }
        Returns: Json
      }
      shop_admin_audit_event: {
        Args: {
          p_code: string
          p_event_key: string
          p_metadata?: Json
          p_result: string
          p_shop_id: string
        }
        Returns: Json
      }
      shop_catalog_archive_category: {
        Args: { p_category_id: string; p_reason?: string; p_shop_id: string }
        Returns: Json
      }
      shop_catalog_archive_category_with_sync: {
        Args: {
          p_actor_kind?: string
          p_category_id: string
          p_reason?: string
          p_shop_id: string
        }
        Returns: Json
      }
      shop_catalog_archive_product: {
        Args: { p_product_id: string; p_reason?: string; p_shop_id: string }
        Returns: Json
      }
      shop_catalog_archive_product_with_sync: {
        Args: {
          p_actor_kind?: string
          p_product_id: string
          p_reason?: string
          p_shop_id: string
        }
        Returns: Json
      }
      shop_catalog_archive_supplier: {
        Args: { p_reason?: string; p_shop_id: string; p_supplier_id: string }
        Returns: Json
      }
      shop_catalog_archive_supplier_with_sync: {
        Args: {
          p_actor_kind?: string
          p_reason?: string
          p_shop_id: string
          p_supplier_id: string
        }
        Returns: Json
      }
      shop_catalog_create_category: {
        Args: { p_name: string; p_shop_id: string }
        Returns: Json
      }
      shop_catalog_create_category_with_sync: {
        Args: { p_actor_kind?: string; p_name: string; p_shop_id: string }
        Returns: Json
      }
      shop_catalog_create_product: {
        Args: {
          p_barcode: string
          p_category_id?: string
          p_item_number?: string
          p_product_name?: string
          p_purchase_price?: number
          p_retail_price?: number
          p_second_product_name?: string
          p_shop_id: string
          p_stock_quantity?: number
          p_supplier_id?: string
        }
        Returns: Json
      }
      shop_catalog_create_product_with_sync: {
        Args: {
          p_actor_kind?: string
          p_barcode: string
          p_category_id?: string
          p_item_number?: string
          p_product_name?: string
          p_purchase_price?: number
          p_retail_price?: number
          p_second_product_name?: string
          p_shop_id: string
          p_stock_quantity?: number
          p_supplier_id?: string
        }
        Returns: Json
      }
      shop_catalog_create_supplier: {
        Args: { p_name: string; p_shop_id: string }
        Returns: Json
      }
      shop_catalog_create_supplier_with_sync: {
        Args: { p_actor_kind?: string; p_name: string; p_shop_id: string }
        Returns: Json
      }
      shop_catalog_import_price_history: {
        Args: { p_prices: Json; p_shop_id: string }
        Returns: Json
      }
      shop_catalog_import_products: {
        Args: { p_products: Json; p_shop_id: string }
        Returns: Json
      }
      shop_catalog_restore_product: {
        Args: { p_product_id: string; p_reason?: string; p_shop_id: string }
        Returns: Json
      }
      shop_catalog_restore_product_with_sync: {
        Args: {
          p_actor_kind?: string
          p_product_id: string
          p_reason?: string
          p_shop_id: string
        }
        Returns: Json
      }
      shop_catalog_update_category: {
        Args: { p_category_id: string; p_name: string; p_shop_id: string }
        Returns: Json
      }
      shop_catalog_update_category_with_sync: {
        Args: {
          p_actor_kind?: string
          p_category_id: string
          p_name: string
          p_shop_id: string
        }
        Returns: Json
      }
      shop_catalog_update_product: {
        Args: {
          p_barcode: string
          p_category_id?: string
          p_item_number?: string
          p_product_id: string
          p_product_name?: string
          p_purchase_price?: number
          p_retail_price?: number
          p_second_product_name?: string
          p_shop_id: string
          p_stock_quantity?: number
          p_supplier_id?: string
        }
        Returns: Json
      }
      shop_catalog_update_product_with_sync: {
        Args: {
          p_actor_kind?: string
          p_barcode: string
          p_category_id?: string
          p_item_number?: string
          p_product_id: string
          p_product_name?: string
          p_purchase_price?: number
          p_retail_price?: number
          p_second_product_name?: string
          p_shop_id: string
          p_stock_quantity?: number
          p_supplier_id?: string
        }
        Returns: Json
      }
      shop_catalog_update_product_if_revision_with_sync: {
        Args: {
          p_actor_kind?: string
          p_barcode: string
          p_category_id?: string
          p_expected_updated_at: string
          p_item_number?: string
          p_product_id: string
          p_product_name?: string
          p_purchase_price?: number
          p_retail_price?: number
          p_second_product_name?: string
          p_shop_id: string
          p_stock_quantity?: number
          p_supplier_id?: string
        }
        Returns: Json
      }
      shop_catalog_set_product_archived_if_revision_with_sync: {
        Args: {
          p_actor_kind?: string
          p_archived: boolean
          p_expected_updated_at: string
          p_product_id: string
          p_reason?: string
          p_shop_id: string
        }
        Returns: Json
      }
      shop_catalog_update_supplier: {
        Args: { p_name: string; p_shop_id: string; p_supplier_id: string }
        Returns: Json
      }
      shop_catalog_update_supplier_with_sync: {
        Args: {
          p_actor_kind?: string
          p_name: string
          p_shop_id: string
          p_supplier_id: string
        }
        Returns: Json
      }
      shop_device_reactivate: {
        Args: { p_reason?: string; p_shop_device_id: string; p_shop_id: string }
        Returns: Json
      }
      shop_device_register: {
        Args: {
          p_app_version?: string
          p_device_identifier: string
          p_device_type?: string
          p_display_name?: string
          p_metadata?: Json
          p_shop_id: string
        }
        Returns: Json
      }
      shop_device_register_current_owner: {
        Args: {
          p_app_version?: string
          p_device_identifier: string
          p_device_type?: string
          p_display_name?: string
          p_metadata?: Json
        }
        Returns: Json
      }
      mobile_linked_shops: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      shop_device_register_for_shop: {
        Args: {
          p_app_version?: string
          p_device_identifier: string
          p_device_type?: string
          p_display_name?: string
          p_metadata?: Json
          p_shop_id: string
        }
        Returns: Json
      }
      shop_device_status_for_shop: {
        Args: { p_device_identifier: string; p_shop_id: string }
        Returns: Json
      }
      shop_device_status_current_owner: {
        Args: { p_device_identifier: string }
        Returns: Json
      }
      shop_device_rename: {
        Args: {
          p_display_name: string
          p_shop_device_id: string
          p_shop_id: string
        }
        Returns: Json
      }
      shop_device_revoke: {
        Args: { p_reason?: string; p_shop_device_id: string; p_shop_id: string }
        Returns: Json
      }
      shop_member_invite_profile: {
        Args: { p_profile_id: string; p_role_key: string; p_shop_id: string }
        Returns: Json
      }
      shop_member_remove: {
        Args: { p_reason?: string; p_shop_id: string; p_shop_member_id: string }
        Returns: Json
      }
      shop_member_update_role: {
        Args: {
          p_role_key: string
          p_shop_id: string
          p_shop_member_id: string
        }
        Returns: Json
      }
      staff_record_login_failure: {
        Args: {
          p_channel: string
          p_expected_credential_version: number | null
          p_metadata_redacted: Json
          p_shop_code: string | null
          p_shop_id: string | null
          p_staff_code: string | null
          p_staff_id: string | null
        }
        Returns: Json
      }
      shop_staff_archive: {
        Args: { p_reason?: string; p_shop_id: string; p_staff_id: string }
        Returns: Json
      }
      shop_staff_clear_lockout: {
        Args: { p_reason: string; p_shop_id: string; p_staff_id: string }
        Returns: Json
      }
      shop_staff_create: {
        Args: {
          p_credential_expires_at?: string
          p_credential_hash: string
          p_credential_kind: string
          p_display_name: string
          p_role_key: string
          p_shop_id: string
          p_staff_code: string
        }
        Returns: Json
      }
      shop_staff_force_credential_rotation: {
        Args: { p_reason: string; p_shop_id: string; p_staff_id: string }
        Returns: Json
      }
      shop_staff_lifecycle_as_staff_web: {
        Args: {
          p_action: string
          p_actor_staff_id: string
          p_actor_staff_web_session_id: string
          p_reason: string
          p_shop_id: string
          p_target_staff_id: string
        }
        Returns: Json
      }
      shop_staff_lifecycle_as_personal_account: {
        Args: {
          p_action: string
          p_reason: string
          p_shop_id: string
          p_target_staff_id: string
        }
        Returns: Json
      }
      shop_staff_mutate_as_staff_web: {
        Args: {
          p_action: string
          p_actor_staff_id: string
          p_actor_staff_web_session_id: string
          p_credential_expires_at: string | null
          p_credential_hash: string | null
          p_credential_kind: string | null
          p_display_name: string | null
          p_reason: string | null
          p_role_key: string | null
          p_shop_id: string
          p_staff_code: string | null
          p_target_staff_id: string | null
        }
        Returns: Json
      }
      shop_staff_reactivate: {
        Args: { p_reason?: string; p_shop_id: string; p_staff_id: string }
        Returns: Json
      }
      shop_staff_replace_role_permissions_as_web: {
        Args: {
          p_actor_staff_id: string | null
          p_actor_staff_web_session_id: string | null
          p_permissions: string[]
          p_role_key: string
          p_shop_id: string
        }
        Returns: Json
      }
      shop_staff_reset_credential: {
        Args: {
          p_credential_expires_at?: string
          p_credential_hash: string
          p_credential_kind: string
          p_reason: string
          p_shop_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      shop_staff_suspend: {
        Args: { p_reason?: string; p_shop_id: string; p_staff_id: string }
        Returns: Json
      }
      shop_catalog_admin_read_v1: {
        Args: {
          p_expected_credential_version?: number | null
          p_operation: string
          p_request?: Json
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
        }
        Returns: Json
      }
      admin_customer_order_transition_v1: {
        Args: {
          p_correlation_id: string
          p_expected_credential_version?: number | null
          p_expected_status_version: number
          p_idempotency_key: string
          p_operation: string
          p_order_id: string
          p_reason_code?: string | null
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
        }
        Returns: Json
      }
      admin_customer_orders_read_v1: {
        Args: {
          p_expected_credential_version?: number | null
          p_operation: string
          p_request?: Json
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
        }
        Returns: Json
      }
      admin_customer_after_sales_read_v1: {
        Args: {
          p_expected_credential_version?: number | null
          p_page?: number
          p_page_size?: number
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
          p_status?: string | null
        }
        Returns: Json
      }
      admin_customer_after_sales_evidence_read_v1: {
        Args: {
          p_evidence_id: string
          p_expected_credential_version?: number | null
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
        }
        Returns: Json
      }
      service_after_sales_evidence_cleanup_claim_v1: {
        Args: {
          p_limit?: number
          p_orphan_before?: string
          p_rejected_before?: string
        }
        Returns: Json
      }
      service_after_sales_evidence_cleanup_ack_v1: {
        Args: {
          p_claim_id: string
          p_storage_deleted: boolean
        }
        Returns: Json
      }
      admin_customer_after_sales_transition_v1: {
        Args: {
          p_case_id: string
          p_expected_credential_version?: number | null
          p_expected_version: number
          p_note_key?: string | null
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
          p_target_status: string
        }
        Returns: Json
      }
      admin_customer_reviews_read_v1: {
        Args: {
          p_expected_credential_version?: number | null
          p_page?: number
          p_page_size?: number
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
          p_status?: string
        }
        Returns: Json
      }
      admin_customer_review_moderate_v1: {
        Args: {
          p_expected_credential_version?: number | null
          p_expected_version: number
          p_reason?: string | null
          p_review_id: string
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
          p_target_status: string
        }
        Returns: Json
      }
      admin_delivery_tracking_read_v1: {
        Args: {
          p_expected_credential_version?: number | null
          p_operation?: string
          p_request?: Json
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
        }
        Returns: Json
      }
      admin_delivery_tracking_manage_v1: {
        Args: {
          p_expected_credential_version?: number | null
          p_idempotency_key: string
          p_operation: string
          p_order_id: string
          p_request: Json
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
        }
        Returns: Json
      }
      storefront_courier_tracking_control_v1: {
        Args: {
          p_expected_credential_version: number
          p_idempotency_key: string
          p_operation: string
          p_order_id: string
          p_session_token_hash: string
          p_shop_id: string
          p_staff_id: string
          p_staff_web_session_id: string
        }
        Returns: Json
      }
      storefront_courier_location_upsert_v1: {
        Args: {
          p_bearing_degrees?: number | null
          p_expected_credential_version?: number | null
          p_horizontal_accuracy_meters: number
          p_idempotency_key: string
          p_latitude: number
          p_longitude: number
          p_observed_at: string
          p_order_id: string
          p_session_token_hash?: string | null
          p_shop_id: string
          p_speed_meters_per_second?: number | null
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
        }
        Returns: Json
      }
      storefront_order_tracking_v1: {
        Args: { p_order_id: string; p_shop_slug: string }
        Returns: Json
      }
      admin_storefront_image_finalize_v1: {
        Args: {
          p_expected_credential_version?: number
          p_image_publication_id: string
          p_session_token_hash?: string
          p_shop_id: string
          p_staff_id?: string
          p_staff_web_session_id?: string
          p_verified_variants: Json
        }
        Returns: Json
      }
      admin_storefront_image_finalize_server_v2: {
        Args: {
          p_actor_profile_id?: string | null
          p_expected_credential_version?: number | null
          p_image_publication_id: string
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
          p_verified_variants: Json
        }
        Returns: Json
      }
      storefront_image_cleanup_claim_v2: {
        Args: { p_limit?: number }
        Returns: Json
      }
      storefront_image_cleanup_complete_v2: {
        Args: {
          p_claim_token: string
          p_error_code?: string | null
          p_removed: boolean
          p_variant_id: string
        }
        Returns: Json
      }
      storefront_image_configure_origin_v1: {
        Args: { p_origin: string }
        Returns: Json
      }
      admin_storefront_image_intent_v1: {
        Args: {
          p_expected_credential_version?: number
          p_publication_id: string
          p_session_token_hash?: string
          p_shop_id: string
          p_source_image_version_id: string
          p_staff_id?: string
          p_staff_web_session_id?: string
          p_variants: Json
        }
        Returns: Json
      }
      admin_storefront_image_rollback_v1: {
        Args: {
          p_expected_credential_version?: number
          p_session_token_hash?: string
          p_shop_id: string
          p_staff_id?: string
          p_staff_web_session_id?: string
          p_target_image_publication_id: string
        }
        Returns: Json
      }
      admin_storefront_image_source_read_v1: {
        Args: {
          p_expected_credential_version?: number
          p_publication_id: string
          p_session_token_hash?: string
          p_shop_id: string
          p_source_image_version_id: string
          p_staff_id?: string
          p_staff_web_session_id?: string
        }
        Returns: Json
      }
      admin_storefront_images_read_v1: {
        Args: {
          p_expected_credential_version?: number
          p_session_token_hash?: string
          p_shop_id: string
          p_staff_id?: string
          p_staff_web_session_id?: string
        }
        Returns: Json
      }
      admin_storefront_fulfillment_read_v1: {
        Args: {
          p_expected_credential_version?: number | null
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
        }
        Returns: Json
      }
      admin_storefront_fulfillment_mutate_v1: {
        Args: {
          p_expected_credential_version?: number | null
          p_operation: string
          p_payload: Json
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
        }
        Returns: Json
      }
      admin_storefront_payment_read_v1: {
        Args: {
          p_expected_credential_version?: number | null
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
        }
        Returns: Json
      }
      admin_storefront_payment_mutate_v1: {
        Args: {
          p_expected_credential_version?: number | null
          p_payload: Json
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
        }
        Returns: Json
      }
      admin_storefront_publications_read_v1: {
        Args: {
          p_availability?: string | null
          p_category_id?: string | null
          p_discounted?: boolean | null
          p_expected_credential_version?: number | null
          p_missing_image?: boolean | null
          p_page?: number
          p_page_size?: number
          p_query?: string | null
          p_session_token_hash?: string | null
          p_shop_id: string
          p_sort?: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
          p_status?: string | null
        }
        Returns: Json
      }
      admin_storefront_publication_mutate_v1: {
        Args: {
          p_expected_credential_version?: number | null
          p_operation: string
          p_payload: Json
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
        }
        Returns: Json
      }
      admin_storefront_publication_bulk_mutate_v2: {
        Args: {
          p_expected_credential_version?: number | null
          p_idempotency_key: string
          p_items: Json
          p_operation: string
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
        }
        Returns: Json
      }
      storefront_publication_authoring_mutate_v1: {
        Args: {
          p_expected_credential_version?: number | null
          p_expected_version?: number | null
          p_idempotency_key: string
          p_operation: string
          p_payload: Json
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
        }
        Returns: Json
      }
      storefront_publications_authoring_read_v1: {
        Args: {
          p_expected_credential_version?: number | null
          p_page?: number
          p_page_size?: number
          p_session_token_hash?: string | null
          p_shop_id: string
          p_source_product_ids?: string[] | null
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
          p_status?: string | null
        }
        Returns: Json
      }
      admin_storefront_promotions_read_v1: {
        Args: {
          p_expected_credential_version?: number | null
          p_page?: number
          p_page_size?: number
          p_query?: string | null
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
          p_status?: string | null
        }
        Returns: Json
      }
      admin_storefront_promotion_mutate_v1: {
        Args: {
          p_expected_credential_version?: number | null
          p_operation: string
          p_payload: Json
          p_session_token_hash?: string | null
          p_shop_id: string
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
        }
        Returns: Json
      }
      shop_pos_recovery_action_v1: {
        Args: {
          p_action_type: string
          p_actor_profile_id: string
          p_note_redacted?: string | null
          p_shop_id: string
          p_target_id: string
          p_target_type: string
        }
        Returns: Json
      }
      shop_sync_recovery_checkpoint_v1: {
        Args: {
          p_device_identifier: string
          p_expected_baseline_scope_key?: string | null
          p_shop_id: string
          p_verified_baseline_id?: string
        }
        Returns: Json
      }
      shop_sync_convergence_marker_v1: {
        Args: {
          p_device_identifier: string
          p_expected_baseline_scope_key?: string | null
          p_shop_id: string
          p_verified_baseline_id?: string
        }
        Returns: Json
      }
      shop_sync_recovery_page_v1: {
        Args: {
          p_after_id?: string | null
          p_device_identifier: string
          p_domain: string
          p_expected_domain_event_max_id?: string | null
          p_expected_event_max_id?: string | null
          p_expected_scope_key?: string | null
          p_limit?: number
          p_shop_id: string
        }
        Returns: Json
      }
      shop_sync_event_page_v1: {
        Args: {
          p_after_id?: string
          p_device_identifier: string
          p_expected_event_max_id?: string | null
          p_expected_scope_key?: string | null
          p_limit?: number
          p_shop_id: string
        }
        Returns: Json
      }
      shop_sync_rows_by_ids_v1: {
        Args: {
          p_device_identifier: string
          p_domain: string
          p_entity_ids: string[]
          p_expected_domain_event_max_id?: string | null
          p_expected_event_max_id?: string | null
          p_expected_scope_key?: string | null
          p_shop_id: string
        }
        Returns: Json
      }
      wechat_auth_audit_v1: {
        Args: {
          p_actor_profile_id?: string
          p_correlation_id: string
          p_event_key: string
          p_metadata_redacted?: Json
          p_result: string
          p_subject_hash?: string
        }
        Returns: undefined
      }
      wechat_auth_challenge_consume_v1: {
        Args: {
          p_correlation_id: string
          p_device_hash: string
          p_ip_hash: string
          p_mode: string
          p_nonce_hash: string
          p_state_hash: string
          p_surface: string
        }
        Returns: boolean
      }
      wechat_auth_challenge_issue_v1: {
        Args: {
          p_correlation_id: string
          p_device_hash: string
          p_ip_hash: string
          p_mode: string
          p_nonce_hash: string
          p_state_hash: string
          p_surface: string
          p_ttl_seconds?: number
        }
        Returns: Json
      }
      wechat_authorized_shops_v1: {
        Args: never
        Returns: {
          currency_code: string
          role_key: string
          server_time: string
          shop_code: string
          shop_id: string
          shop_name: string
          time_zone: string
        }[]
      }
      wechat_authorized_shops_v2: {
        Args: never
        Returns: {
          can_change_prices: boolean
          can_manage_images: boolean
          can_read_catalog: boolean
          can_read_catalog_history: boolean
          can_write_categories: boolean
          can_write_products: boolean
          can_write_suppliers: boolean
          currency_code: string
          role_key: string
          server_time: string
          shop_code: string
          shop_id: string
          shop_name: string
          time_zone: string
        }[]
      }
      wechat_catalog_history_page_v1: {
        Args: {
          p_before_audit_log_id?: string | null
          p_before_created_at?: string | null
          p_entity_id?: string | null
          p_entity_type?: string | null
          p_from_at?: string | null
          p_limit?: number
          p_operation?: string | null
          p_shop_id: string
          p_to_at?: string | null
        }
        Returns: {
          actor_display_name: string
          actor_kind: string
          correlation_id_redacted: string | null
          entity_id_redacted: string | null
          entity_type: string
          history_id: string
          occurred_at: string
          operation: string
          result: string
          shop_id: string
          summary: string
          surface: string
        }[]
      }
      wechat_catalog_lifecycle_page_v2: {
        Args: {
          p_before_id?: string | null
          p_before_updated_at?: string | null
          p_entity_type?: string
          p_limit?: number
          p_shop_id: string
          p_state?: string
        }
        Returns: {
          active_product_count: number
          barcode: string | null
          deleted_at: string | null
          display_name: string
          entity_id: string
          entity_type: string
          state: string
          updated_at: string
        }[]
      }
      wechat_catalog_mutate_v1: {
        Args: {
          p_actor_profile_id: string
          p_correlation_id: string
          p_expected_updated_at: string | null
          p_idempotency_key: string
          p_operation: string
          p_payload: Json
          p_shop_id: string
          p_target_id: string | null
        }
        Returns: Json
      }
      wechat_daily_sales_page_v1: {
        Args: {
          p_before_occurred_at?: string
          p_before_sale_id?: string
          p_business_date?: string
          p_limit?: number
          p_shop_id: string
        }
        Returns: {
          business_date: string
          business_kind: string
          currency_code: string
          fiscal_status: string
          latest_update_at: string
          net_amount_clp: number
          occurred_at: string
          pos_sale_id: string
          sale_number: string
          sale_status: string
          time_zone: string
        }[]
      }
      wechat_daily_sales_summary_v1: {
        Args: { p_business_date?: string; p_shop_id: string }
        Returns: {
          business_date: string
          currency_code: string
          discounts_clp: number
          gross_sales_clp: number
          latest_ledger_at: string
          net_revenue_clp: number
          refund_count: number
          refunds_clp: number
          sale_count: number
          server_time: string
          shop_id: string
          time_zone: string
          transaction_count: number
          void_count: number
        }[]
      }
      wechat_sale_detail_v1: {
        Args: { p_pos_sale_id: string; p_shop_id: string }
        Returns: {
          entry_type: string
          line_amount_clp: number
          line_position: number
          product_name: string
          quantity: number
          unit_amount_clp: number
        }[]
      }
      customer_address_create_v3: {
        Args: { p_intent_id: string; p_payload: Json }
        Returns: Json
      }
      customer_address_create_reconcile_v3: {
        Args: { p_intent_id: string }
        Returns: Json
      }
      customer_address_delete_v2: {
        Args: { p_address_id: string; p_expected_version: number }
        Returns: Json
      }
      customer_address_upsert_v2: {
        Args: {
          p_address_id: string | null
          p_expected_version: number | null
          p_payload: Json
        }
        Returns: Json
      }
      customer_addresses_read_v2: { Args: never; Returns: Json }
      customer_after_sales_cancel_v1: {
        Args: { p_case_id: string; p_expected_version: number }
        Returns: Json
      }
      customer_after_sales_create_v1: {
        Args: {
          p_idempotency_key: string
          p_lines: Json
          p_note: string | null
          p_order_id: string
          p_reason: string
          p_type: string
        }
        Returns: Json
      }
      customer_after_sales_evidence_register_v1: {
        Args: { p_case_id: string; p_object_path: string }
        Returns: Json
      }
      customer_after_sales_evidence_upload_ticket_v1: {
        Args: { p_case_id: string; p_extension: string }
        Returns: Json
      }
      customer_after_sales_list_v1: {
        Args: { p_page_size?: number; p_shop_slug: string }
        Returns: Json
      }
      customer_after_sales_order_lines_v1: {
        Args: { p_order_id: string }
        Returns: Json
      }
      customer_cancel_account_deletion_v1: {
        Args: { p_request_id: string }
        Returns: Json
      }
      customer_cart_merge_guest_v1: {
        Args: {
          p_expected_version: number
          p_guest_items: Json
          p_idempotency_key: string
          p_shop_slug: string
        }
        Returns: Json
      }
      customer_cart_mutate_v1: {
        Args: {
          p_expected_version: number
          p_idempotency_key: string
          p_operation: string
          p_publication_id: string
          p_quantity: number
          p_shop_slug: string
        }
        Returns: Json
      }
      customer_cart_read_v1: { Args: { p_shop_slug: string }; Returns: Json }
      customer_cart_revalidate_v1: {
        Args: {
          p_expected_version: number
          p_idempotency_key: string
          p_shop_slug: string
        }
        Returns: Json
      }
      customer_checkout_quote_confirm_v1: {
        Args: {
          p_expected_quote_version: number
          p_idempotency_key: string
          p_quote_id: string
        }
        Returns: Json
      }
      customer_checkout_quote_create_v1: {
        Args: {
          p_address_id: string | null
          p_cart_version: number
          p_fulfillment_mode: string
          p_idempotency_key: string
          p_pickup_point_id: string | null
          p_shop_slug: string
          p_slot_id: string
        }
        Returns: Json
      }
      customer_checkout_quote_create_v2: {
        Args: {
          p_address_id: string | null
          p_cart_version: number
          p_expected_context_version: number
          p_fulfillment_mode: string
          p_idempotency_key: string
          p_pickup_point_id: string | null
          p_shop_slug: string
          p_slot_id: string
        }
        Returns: Json
      }
      customer_checkout_quote_read_v1: {
        Args: { p_quote_id: string }
        Returns: Json
      }
      customer_data_export_v1: { Args: never; Returns: Json }
      customer_delivery_context_read_v1: {
        Args: { p_shop_slug: string }
        Returns: Json
      }
      customer_delivery_context_select_v1: {
        Args: {
          p_address_id: string | null
          p_expected_version?: number | null
          p_mode: string
          p_pickup_point_id: string | null
          p_shop_slug: string
        }
        Returns: Json
      }
      customer_device_status_v1: {
        Args: { p_installation_id: string }
        Returns: Json
      }
      customer_notification_ack_v1: {
        Args: {
          p_ack_idempotency_key: string
          p_delivery_id: string
          p_destination_generation: number
          p_error_code?: string | null
          p_lease_token: string
          p_outcome: string
          p_provider_message_id?: string | null
        }
        Returns: Json
      }
      customer_notification_claim_v1: {
        Args: {
          p_dispatcher_id: string
          p_lease_seconds: number
          p_limit: number
        }
        Returns: Json
      }
      customer_notification_mark_read_v1: {
        Args: { p_notification_id: string }
        Returns: Json
      }
      customer_notification_route_v1: {
        Args: { p_route_token: string; p_shop_slug: string }
        Returns: Json
      }
      customer_notifications_list_v1: {
        Args: {
          p_before_created_at?: string | null
          p_before_id?: string | null
          p_category?: string | null
          p_page_size?: number
          p_shop_slug: string
        }
        Returns: Json
      }
      customer_notifications_mark_all_read_v1: {
        Args: { p_shop_slug: string }
        Returns: Json
      }
      customer_order_cancel_v1: {
        Args: {
          p_expected_status_version: number
          p_idempotency_key: string
          p_order_id: string
          p_shop_slug: string
        }
        Returns: Json
      }
      customer_order_create_v1: {
        Args: {
          p_expected_quote_version: number
          p_idempotency_key: string
          p_quote_id: string
        }
        Returns: Json
      }
      customer_order_create_v2: {
        Args: {
          p_expected_quote_version: number
          p_idempotency_key: string
          p_payment_method: string
          p_quote_id: string
        }
        Returns: Json
      }
      customer_order_detail_v1: {
        Args: { p_order_id: string; p_shop_slug: string }
        Returns: Json
      }
      customer_order_list_v1: {
        Args: {
          p_before_order_id?: string | null
          p_before_placed_at?: string | null
          p_limit?: number
          p_shop_slug: string
        }
        Returns: Json
      }
      customer_order_read_v1: { Args: { p_order_id: string }; Returns: Json }
      customer_order_read_v2: { Args: { p_order_id: string }; Returns: Json }
      customer_order_reorder_apply_v1: {
        Args: { p_idempotency_key: string; p_order_id: string }
        Returns: Json
      }
      customer_order_reorder_preview_v1: {
        Args: { p_order_id: string }
        Returns: Json
      }
      customer_payment_recovery_read_v1: {
        Args: { p_order_id: string }
        Returns: Json
      }
      customer_record_privacy_consent_v1: {
        Args: { p_accepted: boolean; p_version: string | null }
        Returns: Json
      }
      customer_register_device_v1: {
        Args: {
          p_consent_status: string
          p_idempotency_key: string
          p_installation_id: string
          p_locale: string
          p_permission_status: string
          p_platform: string
          p_push_token: string
        }
        Returns: Json
      }
      customer_request_account_deletion_v1: {
        Args: { p_idempotency_key: string }
        Returns: Json
      }
      customer_reservation_hold_create_v1: {
        Args: {
          p_idempotency_key: string
          p_publication_id: string
          p_quantity: number
          p_shop_slug: string
        }
        Returns: Json
      }
      customer_reservation_hold_read_v1: {
        Args: { p_hold_id: string }
        Returns: Json
      }
      customer_reservation_hold_release_v1: {
        Args: { p_hold_id: string; p_idempotency_key: string }
        Returns: Json
      }
      customer_review_submit_v1: {
        Args: { p_comment: string; p_order_item_id: string; p_rating: number }
        Returns: Json
      }
      customer_review_update_v1: {
        Args: {
          p_comment: string
          p_expected_version: number
          p_rating: number
          p_review_id: string
          p_withdraw?: boolean
        }
        Returns: Json
      }
      customer_reviews_list_v1: {
        Args: { p_pending_only?: boolean; p_shop_slug: string }
        Returns: Json
      }
      customer_revoke_device_v1: {
        Args: { p_idempotency_key: string; p_installation_id: string }
        Returns: Json
      }
      customer_set_default_address_v1: {
        Args: { p_address_id: string }
        Returns: Json
      }
      service_after_sales_evidence_scan_ack_v1: {
        Args: {
          p_byte_size: number
          p_evidence_id: string
          p_exif_removed: boolean
          p_height: number
          p_mime_type: string
          p_rejection_code?: string | null
          p_scan_outcome: string
          p_width: number
        }
        Returns: Json
      }
      service_customer_after_sales_refund_ack_v1: {
        Args: {
          p_case_id: string
          p_manual_attestation_id?: string | null
          p_provider_event_sha256?: string | null
        }
        Returns: Json
      }
      service_customer_payment_transition_v1: {
        Args: {
          p_failure_code?: string | null
          p_idempotency_key: string
          p_payment_id: string
          p_provider_reference_sha256?: string | null
          p_source?: string
          p_target_status: string
        }
        Returns: Json
      }
      service_customer_payment_webhook_receive_v1: {
        Args: {
          p_occurred_at: string
          p_payload_sha256: string
          p_provider_event_id_sha256: string
          p_provider_key: string
          p_signature_validated: boolean
        }
        Returns: Json
      }
      storefront_authoring_bind_android_session_v1: {
        Args: never
        Returns: Json
      }
      storefront_authoring_bind_ios_session_v1: { Args: never; Returns: Json }
      storefront_availability_ingest_v1: {
        Args: {
          p_expires_at: string
          p_idempotency_key: string
          p_shop_id: string
          p_signal_state: string
          p_source_observed_at: string
          p_source_product_id: string
          p_source_version: number
        }
        Returns: Json
      }
      storefront_catalog_v1: {
        Args: {
          p_availability?: string | null
          p_category_slug?: string | null
          p_cursor?: string | null
          p_discounted?: boolean | null
          p_featured?: boolean | null
          p_limit?: number | null
          p_shop_slug: string
          p_sort?: string
        }
        Returns: Json
      }
      storefront_catalog_version_v1: {
        Args: { p_shop_slug: string }
        Returns: Json
      }
      storefront_categories_v1: {
        Args: { p_cursor?: string | null; p_limit?: number | null; p_shop_slug: string }
        Returns: Json
      }
      storefront_delivery_context_preview_v1: {
        Args: {
          p_address_id?: string | null
          p_commune?: string | null
          p_mode: string
          p_pickup_point_id?: string | null
          p_shop_slug: string
        }
        Returns: Json
      }
      storefront_featured_v1: {
        Args: { p_cursor?: string | null; p_limit?: number | null; p_shop_slug: string }
        Returns: Json
      }
      storefront_fulfillment_options_v1: {
        Args: { p_shop_slug: string }
        Returns: Json
      }
      storefront_home_v1: {
        Args: {
          p_category_limit?: number
          p_featured_limit?: number
          p_offer_limit?: number
          p_shop_slug: string
        }
        Returns: Json
      }
      storefront_image_cleanup_claim_v1: {
        Args: { p_limit?: number }
        Returns: Json
      }
      storefront_image_cleanup_complete_v1: {
        Args: {
          p_error_code?: string | null
          p_removed: boolean
          p_variant_id: string
        }
        Returns: Json
      }
      storefront_offers_v1: {
        Args: { p_cursor?: string | null; p_limit?: number | null; p_shop_slug: string }
        Returns: Json
      }
      storefront_payment_options_v1: {
        Args: { p_shop_slug: string }
        Returns: Json
      }
      storefront_product_detail_v1: {
        Args: { p_publication_id: string; p_shop_slug: string }
        Returns: Json
      }
      storefront_product_reviews_v1: {
        Args: {
          p_before_created_at?: string | null
          p_before_id?: string | null
          p_page_size?: number
          p_publication_id: string
          p_shop_slug: string
        }
        Returns: Json
      }
      storefront_publications_authoring_summary_v1: {
        Args: {
          p_expected_credential_version?: number | null
          p_filter?: string
          p_page?: number
          p_page_size?: number
          p_query?: string | null
          p_session_token_hash?: string | null
          p_shop_id: string
          p_source_product_ids?: string[] | null
          p_staff_id?: string | null
          p_staff_web_session_id?: string | null
        }
        Returns: Json
      }
      storefront_search_suggestions_v1: {
        Args: { p_limit?: number; p_query: string; p_shop_slug: string }
        Returns: Json
      }
      storefront_search_v1: {
        Args: {
          p_category_slug?: string | null
          p_cursor?: string | null
          p_limit?: number | null
          p_query: string
          p_shop_slug: string
        }
        Returns: Json
      }
      storefront_settings_v1: { Args: { p_shop_slug: string }; Returns: Json }
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

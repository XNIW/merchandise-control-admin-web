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
    PostgrestVersion: "14.5"
  }
  app_private: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_active_shop_member: {
        Args: { target_shop_id: string }
        Returns: boolean
      }
      is_active_shop_owner_member: {
        Args: { target_shop_id: string }
        Returns: boolean
      }
      is_active_shop_staff_admin_member: {
        Args: { target_shop_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      normalize_admin_label: { Args: { p_value: string }; Returns: string }
      platform_action_result: {
        Args: {
          p_audit_event_id?: string
          p_code: string
          p_ok: boolean
          p_shop_id?: string
        }
        Returns: Json
      }
      resolve_shop_inventory_owner: {
        Args: { target_shop_id: string }
        Returns: string
      }
      shop_admin_action_result: {
        Args: {
          p_audit_event_id?: string
          p_code: string
          p_ok: boolean
          p_payload?: Json
          p_shop_id?: string
          p_target_id?: string
        }
        Returns: Json
      }
      shop_admin_reason_metadata: { Args: { p_reason: string }; Returns: Json }
      write_platform_shop_audit: {
        Args: {
          p_actor_profile_id: string
          p_code: string
          p_event_key: string
          p_reason: string
          p_result: string
          p_scope: string
          p_severity: string
          p_shop_id: string
          p_target_id: string
          p_target_type: string
        }
        Returns: string
      }
      write_shop_admin_audit: {
        Args: {
          p_code: string
          p_event_key: string
          p_metadata?: Json
          p_result: string
          p_severity: string
          p_shop_id: string
          p_target_id: string
          p_target_type: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
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
      categories: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      history_entries: {
        Row: {
          category: string
          complete: string
          data: string
          editable: string
          id: string
          ismanualentry: boolean
          missingitems: number
          ordertotal: number
          paymenttotal: number
          supplier: string
          syncstatus: string
          timestamp: string
          totalitems: number
          uid: number
          wasexported: boolean
        }
        Insert: {
          category?: string
          complete: string
          data: string
          editable: string
          id: string
          ismanualentry?: boolean
          missingitems?: number
          ordertotal?: number
          paymenttotal?: number
          supplier?: string
          syncstatus?: string
          timestamp: string
          totalitems?: number
          uid?: number
          wasexported?: boolean
        }
        Update: {
          category?: string
          complete?: string
          data?: string
          editable?: string
          id?: string
          ismanualentry?: boolean
          missingitems?: number
          ordertotal?: number
          paymenttotal?: number
          supplier?: string
          syncstatus?: string
          timestamp?: string
          totalitems?: number
          uid?: number
          wasexported?: boolean
        }
        Relationships: []
      }
      inventory_categories: {
        Row: {
          deleted_at: string | null
          id: string
          name: string
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          deleted_at?: string | null
          id?: string
          name: string
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          deleted_at?: string | null
          id?: string
          name?: string
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: []
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
          source: string | null
          type: string
        }
        Insert: {
          created_at: string
          effective_at: string
          id: string
          note?: string | null
          owner_user_id: string
          price: number
          product_id: string
          source?: string | null
          type: string
        }
        Update: {
          created_at?: string
          effective_at?: string
          id?: string
          note?: string | null
          owner_user_id?: string
          price?: number
          product_id?: string
          source?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["id"]
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
          product_name: string | null
          purchase_price: number | null
          retail_price: number | null
          second_product_name: string | null
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
          product_name?: string | null
          purchase_price?: number | null
          retail_price?: number | null
          second_product_name?: string | null
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
          product_name?: string | null
          purchase_price?: number | null
          retail_price?: number | null
          second_product_name?: string | null
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
          updated_at: string
        }
        Insert: {
          deleted_at?: string | null
          id?: string
          name: string
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          deleted_at?: string | null
          id?: string
          name?: string
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: []
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
      pos_device_credentials: {
        Row: {
          created_at: string
          expires_at: string
          issued_at: string
          last_used_at: string | null
          metadata_redacted: Json
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
      pos_sessions: {
        Row: {
          created_at: string
          expires_at: string
          heartbeat_count: number
          issued_at: string
          last_seen_at: string | null
          metadata_redacted: Json
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
          metadata_redacted?: Json
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
          metadata_redacted?: Json
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
      product_prices: {
        Row: {
          createdat: string
          effectiveat: string
          id: number
          note: string | null
          price: number
          productid: number
          source: string | null
          type: string
        }
        Insert: {
          createdat: string
          effectiveat: string
          id?: number
          note?: string | null
          price: number
          productid: number
          source?: string | null
          type: string
        }
        Update: {
          createdat?: string
          effectiveat?: string
          id?: number
          note?: string | null
          price?: number
          productid?: number
          source?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_productid_fkey"
            columns: ["productid"]
            isOneToOne: false
            referencedRelation: "product_price_summary"
            referencedColumns: ["productid"]
          },
          {
            foreignKeyName: "product_prices_productid_fkey"
            columns: ["productid"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string
          categoryid: number | null
          id: number
          itemnumber: string | null
          productname: string | null
          purchaseprice: number | null
          retailprice: number | null
          secondproductname: string | null
          stockquantity: number | null
          supplierid: number | null
        }
        Insert: {
          barcode: string
          categoryid?: number | null
          id?: number
          itemnumber?: string | null
          productname?: string | null
          purchaseprice?: number | null
          retailprice?: number | null
          secondproductname?: string | null
          stockquantity?: number | null
          supplierid?: number | null
        }
        Update: {
          barcode?: string
          categoryid?: number | null
          id?: number
          itemnumber?: string | null
          productname?: string | null
          purchaseprice?: number | null
          retailprice?: number | null
          secondproductname?: string | null
          stockquantity?: number | null
          supplierid?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_categoryid_fkey"
            columns: ["categoryid"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplierid_fkey"
            columns: ["supplierid"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
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
          supplier?: string
          timestamp?: string
          updated_at?: string
        }
        Relationships: []
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
          created_at: string
          created_by_profile_id: string | null
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
          created_at?: string
          created_by_profile_id?: string | null
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
          created_at?: string
          created_by_profile_id?: string | null
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
          must_change_credential: boolean
          role_key: string
          session_invalidated_at: string | null
          shop_id: string
          staff_code: string
          staff_id: string
          status: string
          updated_at: string
          updated_by_profile_id: string | null
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
          must_change_credential?: boolean
          role_key: string
          session_invalidated_at?: string | null
          shop_id: string
          staff_code: string
          staff_id?: string
          status?: string
          updated_at?: string
          updated_by_profile_id?: string | null
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
          must_change_credential?: boolean
          role_key?: string
          session_invalidated_at?: string | null
          shop_id?: string
          staff_code?: string
          staff_id?: string
          status?: string
          updated_at?: string
          updated_by_profile_id?: string | null
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
        ]
      }
      suppliers: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
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
          source?: string | null
          source_device_id?: string | null
          store_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      product_price_summary: {
        Row: {
          lastpurchase: number | null
          lastretail: number | null
          prevpurchase: number | null
          prevretail: number | null
          productid: number | null
        }
        Insert: {
          lastpurchase?: never
          lastretail?: never
          prevpurchase?: never
          prevretail?: never
          productid?: number | null
        }
        Update: {
          lastpurchase?: never
          lastretail?: never
          prevpurchase?: never
          prevretail?: never
          productid?: number | null
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
      platform_create_shop: {
        Args: {
          p_owner_profile_id: string
          p_reason: string
          p_shop_code: string
          p_shop_name: string
        }
        Returns: Json
      }
      platform_create_shop_with_pending_owner_invite: {
        Args: {
          p_owner_email: string
          p_reason: string
          p_shop_code: string
          p_shop_name: string
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
      platform_grant_platform_admin: {
        Args: { p_confirmation: string; p_profile_id: string; p_reason: string }
        Returns: Json
      }
      platform_reactivate_shop: {
        Args: { p_confirmation: string; p_reason: string; p_shop_id: string }
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
      record_sync_event: {
        Args: {
          p_batch_id?: string
          p_changed_count?: number
          p_client_event_id?: string
          p_domain: string
          p_entity_ids?: Json
          p_event_type: string
          p_metadata?: Json
          p_source?: string
          p_source_device_id?: string
          p_store_id?: string
        }
        Returns: {
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
          source: string | null
          source_device_id: string | null
          store_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sync_events"
          isOneToOne: true
          isSetofReturn: false
        }
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
      shop_catalog_archive_product: {
        Args: { p_product_id: string; p_reason?: string; p_shop_id: string }
        Returns: Json
      }
      shop_catalog_archive_supplier: {
        Args: { p_reason?: string; p_shop_id: string; p_supplier_id: string }
        Returns: Json
      }
      shop_catalog_create_category: {
        Args: { p_name: string; p_shop_id: string }
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
      shop_catalog_create_supplier: {
        Args: { p_name: string; p_shop_id: string }
        Returns: Json
      }
      shop_catalog_update_category: {
        Args: { p_category_id: string; p_name: string; p_shop_id: string }
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
      shop_catalog_update_supplier: {
        Args: { p_name: string; p_shop_id: string; p_supplier_id: string }
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
      shop_staff_reactivate: {
        Args: { p_reason?: string; p_shop_id: string; p_staff_id: string }
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
  app_private: {
    Enums: {},
  },
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

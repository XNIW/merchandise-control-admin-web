export const staffOperationsSchemas = {
  "pos_live": {
    "devices": "shop_device_id,shop_id,device_identifier,device_type,display_name,app_version,status,last_seen_at,revoked_at,created_at,updated_at",
    "credentials": "pos_device_credential_id,shop_id,shop_device_id,staff_id,status,staff_credential_version,issued_at,last_used_at,expires_at,revoked_at,updated_at",
    "sessions": "pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,status,staff_credential_version,issued_at,expires_at,last_seen_at,heartbeat_count,revoked_at,updated_at",
    "staff": "staff_id,staff_code,display_name,role_key,status,credential_status,locked_until",
    "events": "audit_log_id,event_key,severity,result,target_type,target_id,created_at,metadata_redacted"
  },
  "pos_revenue": {
    "today": "shop_id,business_date,card_received_clp,cash_received_clp,change_given_clp,documented_revenue_clp,latest_ledger_at,net_revenue_clp,other_received_clp,refund_count,sale_count,stock_warning_count,transaction_count,transfer_received_clp,verification_revenue_clp,void_count",
    "month": "shop_id,business_date,card_received_clp,cash_received_clp,change_given_clp,documented_revenue_clp,latest_ledger_at,net_revenue_clp,other_received_clp,refund_count,sale_count,stock_warning_count,transaction_count,transfer_received_clp,verification_revenue_clp,void_count",
    "year": "shop_id,business_date,card_received_clp,cash_received_clp,change_given_clp,documented_revenue_clp,latest_ledger_at,net_revenue_clp,other_received_clp,refund_count,sale_count,stock_warning_count,transaction_count,transfer_received_clp,verification_revenue_clp,void_count",
    "sales": "pos_sale_id,client_sale_id,sale_number,occurred_at,business_date,total,status,shop_device_id,staff_id,business_kind,client_original_sale_id,fiscal_status,net_amount_clp,stock_sync_status,stock_warning_count",
    "batches": "pos_sales_sync_batch_id,client_batch_id,status,sale_count,line_count,shop_device_id,staff_id,received_at,created_at",
    "devices": "shop_device_id,display_name,status,last_seen_at",
    "staff": "staff_id,staff_code,display_name,status",
    "warnings": "created_at,issue_code,movement_kind,pos_sale_id,product_id,quantity_delta,status,stock_after,stock_before"
  },
  "audit_list": {
    "events": "audit_log_id,actor_profile_id,actor_staff_id,scope,shop_id,event_key,severity,result,target_type,target_id,metadata_redacted,created_at"
  },
  "audit_detail": {
    "events": "audit_log_id,actor_profile_id,actor_staff_id,scope,shop_id,event_key,severity,result,target_type,target_id,metadata_redacted,created_at"
  }
} as const;

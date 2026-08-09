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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      admin_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at: string | null
          last_used_ip: string | null
          request_count: number
          revoked_at: string | null
          revoked_by: string | null
          rotated_at: string | null
          scopes: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at?: string | null
          last_used_ip?: string | null
          request_count?: number
          revoked_at?: string | null
          revoked_by?: string | null
          rotated_at?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          label?: string
          last_used_at?: string | null
          last_used_ip?: string | null
          request_count?: number
          revoked_at?: string | null
          revoked_by?: string | null
          rotated_at?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      admin_audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          alt_text: string | null
          aspect_ratio: string | null
          checksum: string | null
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          file_name: string
          file_size: number
          folder_id: string | null
          height: number | null
          id: string
          media_type: string
          mime_type: string
          processing_status: string
          storage_path: string
          tags: string[]
          updated_at: string
          uploaded_by: string
          width: number | null
          workspace_id: string
        }
        Insert: {
          alt_text?: string | null
          aspect_ratio?: string | null
          checksum?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          file_name: string
          file_size?: number
          folder_id?: string | null
          height?: number | null
          id?: string
          media_type?: string
          mime_type: string
          processing_status?: string
          storage_path: string
          tags?: string[]
          updated_at?: string
          uploaded_by: string
          width?: number | null
          workspace_id: string
        }
        Update: {
          alt_text?: string | null
          aspect_ratio?: string | null
          checksum?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          file_name?: string
          file_size?: number
          folder_id?: string | null
          height?: number | null
          id?: string
          media_type?: string
          mime_type?: string
          processing_status?: string
          storage_path?: string
          tags?: string[]
          updated_at?: string
          uploaded_by?: string
          width?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "media_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      media_folders: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      media_renders: {
        Row: {
          attempt_count: number
          created_at: string
          created_by: string
          error_code: string | null
          error_message: string | null
          id: string
          mix: Json
          output_size_bytes: number | null
          output_storage_path: string | null
          platform: string | null
          processing_completed_at: string | null
          processing_heartbeat_at: string | null
          processing_started_at: string | null
          source_size_bytes: number | null
          source_storage_path: string
          status: string
          track_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          created_by: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          mix?: Json
          output_size_bytes?: number | null
          output_storage_path?: string | null
          platform?: string | null
          processing_completed_at?: string | null
          processing_heartbeat_at?: string | null
          processing_started_at?: string | null
          source_size_bytes?: number | null
          source_storage_path: string
          status?: string
          track_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          created_by?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          mix?: Json
          output_size_bytes?: number | null
          output_storage_path?: string | null
          platform?: string | null
          processing_completed_at?: string | null
          processing_heartbeat_at?: string | null
          processing_started_at?: string | null
          source_size_bytes?: number | null
          source_storage_path?: string
          status?: string
          track_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_renders_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "music_tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_renders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      music_tracks: {
        Row: {
          allowed_platforms: string[]
          artist: string
          attribution_required: boolean
          attribution_text: string
          audio_path: string | null
          audio_url: string | null
          commercial_use: boolean
          cover_url: string | null
          created_at: string
          duration_seconds: number
          file_hash: string | null
          genre: string
          id: string
          licence_acquired_at: string | null
          licence_expires_at: string | null
          licence_name: string
          licence_proof_path: string | null
          licence_type: string
          licence_url: string | null
          monetization_allowed: boolean
          mood: string
          original_filename: string | null
          ownership_confirmed_at: string | null
          source: string
          status: string
          title: string
          updated_at: string
          uploaded_by: string | null
          usage_rights: Json
          workspace_id: string | null
        }
        Insert: {
          allowed_platforms?: string[]
          artist?: string
          attribution_required?: boolean
          attribution_text?: string
          audio_path?: string | null
          audio_url?: string | null
          commercial_use?: boolean
          cover_url?: string | null
          created_at?: string
          duration_seconds?: number
          file_hash?: string | null
          genre?: string
          id?: string
          licence_acquired_at?: string | null
          licence_expires_at?: string | null
          licence_name?: string
          licence_proof_path?: string | null
          licence_type?: string
          licence_url?: string | null
          monetization_allowed?: boolean
          mood?: string
          original_filename?: string | null
          ownership_confirmed_at?: string | null
          source?: string
          status?: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
          usage_rights?: Json
          workspace_id?: string | null
        }
        Update: {
          allowed_platforms?: string[]
          artist?: string
          attribution_required?: boolean
          attribution_text?: string
          audio_path?: string | null
          audio_url?: string | null
          commercial_use?: boolean
          cover_url?: string | null
          created_at?: string
          duration_seconds?: number
          file_hash?: string | null
          genre?: string
          id?: string
          licence_acquired_at?: string | null
          licence_expires_at?: string | null
          licence_name?: string
          licence_proof_path?: string | null
          licence_type?: string
          licence_url?: string | null
          monetization_allowed?: boolean
          mood?: string
          original_filename?: string | null
          ownership_confirmed_at?: string | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          usage_rights?: Json
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "music_tracks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          post_id: string | null
          read_at: string | null
          social_account_id: string | null
          title: string
          type: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          post_id?: string | null
          read_at?: string | null
          social_account_id?: string | null
          title: string
          type: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          post_id?: string | null
          read_at?: string | null
          social_account_id?: string | null
          title?: string
          type?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          code_verifier: string | null
          consumed_at: string | null
          created_at: string
          existing_account_id: string | null
          expires_at: string
          platform: string
          return_origin: string | null
          return_path: string | null
          state: string
          state_hash: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          code_verifier?: string | null
          consumed_at?: string | null
          created_at?: string
          existing_account_id?: string | null
          expires_at?: string
          platform: string
          return_origin?: string | null
          return_path?: string | null
          state: string
          state_hash?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          code_verifier?: string | null
          consumed_at?: string | null
          created_at?: string
          existing_account_id?: string | null
          expires_at?: string
          platform?: string
          return_origin?: string | null
          return_path?: string | null
          state?: string
          state_hash?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      platform_capabilities: {
        Row: {
          created_at: string
          internal_notice: string | null
          limits: Json
          maintenance_mode: boolean
          max_retries: number
          notice: string | null
          oauth_enabled: boolean
          platform: string
          publishing_enabled: boolean
          rate_limit_config: Json
          required_scopes: string[]
          supported_media_types: string[]
          supported_post_types: string[]
          token_refresh_threshold_minutes: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          internal_notice?: string | null
          limits?: Json
          maintenance_mode?: boolean
          max_retries?: number
          notice?: string | null
          oauth_enabled?: boolean
          platform: string
          publishing_enabled?: boolean
          rate_limit_config?: Json
          required_scopes?: string[]
          supported_media_types?: string[]
          supported_post_types?: string[]
          token_refresh_threshold_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          internal_notice?: string | null
          limits?: Json
          maintenance_mode?: boolean
          max_retries?: number
          notice?: string | null
          oauth_enabled?: boolean
          platform?: string
          publishing_enabled?: boolean
          rate_limit_config?: Json
          required_scopes?: string[]
          supported_media_types?: string[]
          supported_post_types?: string[]
          token_refresh_threshold_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_controls: {
        Row: {
          created_at: string
          maintenance_mode: boolean
          notice: string | null
          platform: string
          publishing_enabled: boolean
          rate_limit_per_hour: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          maintenance_mode?: boolean
          notice?: string | null
          platform: string
          publishing_enabled?: boolean
          rate_limit_per_hour?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          maintenance_mode?: boolean
          notice?: string | null
          platform?: string
          publishing_enabled?: boolean
          rate_limit_per_hour?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_health: {
        Row: {
          alert_message: string | null
          checked_at: string
          consecutive_failures: number
          created_at: string
          failure_alert_threshold: number
          last_error_at: string | null
          last_error_message: string | null
          last_poll_at: string | null
          last_success_at: string | null
          last_webhook_at: string | null
          permission_expiry_alert_days: number
          platform: string
          stale_sync_alert_minutes: number
          sync_status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alert_message?: string | null
          checked_at?: string
          consecutive_failures?: number
          created_at?: string
          failure_alert_threshold?: number
          last_error_at?: string | null
          last_error_message?: string | null
          last_poll_at?: string | null
          last_success_at?: string | null
          last_webhook_at?: string | null
          permission_expiry_alert_days?: number
          platform: string
          stale_sync_alert_minutes?: number
          sync_status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alert_message?: string | null
          checked_at?: string
          consecutive_failures?: number
          created_at?: string
          failure_alert_threshold?: number
          last_error_at?: string | null
          last_error_message?: string | null
          last_poll_at?: string | null
          last_success_at?: string | null
          last_webhook_at?: string | null
          permission_expiry_alert_days?: number
          platform?: string
          stale_sync_alert_minutes?: number
          sync_status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      post_platform_contents: {
        Row: {
          ai_generated: boolean
          alt_text: string
          call_to_action: string
          caption: string
          card_key: string
          connected_account_id: string | null
          created_at: string
          description: string
          destination_id: string | null
          destination_url: string | null
          error_message: string | null
          external_post_id: string | null
          first_comment: string
          hashtags_json: Json
          hook: string
          id: string
          keywords_json: Json
          location: string
          manually_edited: boolean
          overlay_text: string
          pinned_comment: string
          platform: string
          platform_settings_json: Json
          post_id: string
          publish_status: string
          published_at: string | null
          scheduled_at: string | null
          short_description: string
          tags_json: Json
          thumbnail_url: string | null
          title: string
          updated_at: string
          validation_status: string
          workspace_id: string
        }
        Insert: {
          ai_generated?: boolean
          alt_text?: string
          call_to_action?: string
          caption?: string
          card_key?: string
          connected_account_id?: string | null
          created_at?: string
          description?: string
          destination_id?: string | null
          destination_url?: string | null
          error_message?: string | null
          external_post_id?: string | null
          first_comment?: string
          hashtags_json?: Json
          hook?: string
          id?: string
          keywords_json?: Json
          location?: string
          manually_edited?: boolean
          overlay_text?: string
          pinned_comment?: string
          platform: string
          platform_settings_json?: Json
          post_id: string
          publish_status?: string
          published_at?: string | null
          scheduled_at?: string | null
          short_description?: string
          tags_json?: Json
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          validation_status?: string
          workspace_id: string
        }
        Update: {
          ai_generated?: boolean
          alt_text?: string
          call_to_action?: string
          caption?: string
          card_key?: string
          connected_account_id?: string | null
          created_at?: string
          description?: string
          destination_id?: string | null
          destination_url?: string | null
          error_message?: string | null
          external_post_id?: string | null
          first_comment?: string
          hashtags_json?: Json
          hook?: string
          id?: string
          keywords_json?: Json
          location?: string
          manually_edited?: boolean
          overlay_text?: string
          pinned_comment?: string
          platform?: string
          platform_settings_json?: Json
          post_id?: string
          publish_status?: string
          published_at?: string | null
          scheduled_at?: string | null
          short_description?: string
          tags_json?: Json
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          validation_status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_platform_contents_connected_account_id_fkey"
            columns: ["connected_account_id"]
            isOneToOne: false
            referencedRelation: "social_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_platform_contents_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "social_post_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_platform_contents_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_platform_contents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_suspended: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_suspended?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_suspended?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      provider_rate_limits: {
        Row: {
          bucket_key: string
          created_at: string
          id: string
          platform: string
          request_count: number
          request_limit: number
          resets_at: string
          social_account_id: string | null
          updated_at: string
          window_started_at: string
          workspace_id: string | null
        }
        Insert: {
          bucket_key: string
          created_at?: string
          id?: string
          platform: string
          request_count?: number
          request_limit?: number
          resets_at?: string
          social_account_id?: string | null
          updated_at?: string
          window_started_at?: string
          workspace_id?: string | null
        }
        Update: {
          bucket_key?: string
          created_at?: string
          id?: string
          platform?: string
          request_count?: number
          request_limit?: number
          resets_at?: string
          social_account_id?: string | null
          updated_at?: string
          window_started_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_rate_limits_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_rate_limits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      publish_job_attempts: {
        Row: {
          attempt_number: number
          backoff_seconds: number | null
          created_at: string
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          job_id: string
          provider_response: Json | null
          request_payload: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          attempt_number: number
          backoff_seconds?: number | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_id: string
          provider_response?: Json | null
          request_payload?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          attempt_number?: number
          backoff_seconds?: number | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_id?: string
          provider_response?: Json | null
          request_payload?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "publish_job_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "publish_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      publish_job_events: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          attempt_number: number | null
          detail: Json | null
          id: string
          job_id: string
          kind: string
          message: string
          occurred_at: string
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          attempt_number?: number | null
          detail?: Json | null
          id?: string
          job_id: string
          kind: string
          message: string
          occurred_at?: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          attempt_number?: number | null
          detail?: Json | null
          id?: string
          job_id?: string
          kind?: string
          message?: string
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "publish_job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "publish_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      publish_jobs: {
        Row: {
          attempt_count: number
          created_at: string
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          max_attempts: number
          next_retry_at: string | null
          platform: string
          post_title: string
          provider_response: Json | null
          request_payload: Json | null
          scheduled_for: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          max_attempts?: number
          next_retry_at?: string | null
          platform: string
          post_title: string
          provider_response?: Json | null
          request_payload?: Json | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          max_attempts?: number
          next_retry_at?: string | null
          platform?: string
          post_title?: string
          provider_response?: Json | null
          request_payload?: Json | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publish_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      publishing_attempts: {
        Row: {
          attempt_number: number
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          id: string
          job_destination_id: string
          next_retry_at: string | null
          retryable: boolean
          safe_provider_response: Json | null
          safe_request_payload: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["destination_status"]
          workspace_id: string
        }
        Insert: {
          attempt_number: number
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          job_destination_id: string
          next_retry_at?: string | null
          retryable?: boolean
          safe_provider_response?: Json | null
          safe_request_payload?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["destination_status"]
          workspace_id: string
        }
        Update: {
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          job_destination_id?: string
          next_retry_at?: string | null
          retryable?: boolean
          safe_provider_response?: Json | null
          safe_request_payload?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["destination_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publishing_attempts_job_destination_id_fkey"
            columns: ["job_destination_id"]
            isOneToOne: false
            referencedRelation: "publishing_job_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publishing_attempts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      publishing_job_destinations: {
        Row: {
          attempt_count: number
          created_at: string
          id: string
          last_error_code: string | null
          last_error_message: string | null
          last_progress_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_retry_at: string | null
          platform: string
          published_at: string | null
          publishing_job_id: string
          remote_status: string | null
          scheduled_for: string | null
          snapchat_content_id: string | null
          snapchat_destination: string | null
          snapchat_media_id: string | null
          social_account_id: string | null
          social_post_destination_id: string
          status: Database["public"]["Enums"]["destination_status"]
          updated_at: string
          upload_completed_at: string | null
          upload_started_at: string | null
          workspace_id: string
          youtube_bytes_uploaded: number
          youtube_upload_session: string | null
          youtube_video_id: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_progress_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          platform: string
          published_at?: string | null
          publishing_job_id: string
          remote_status?: string | null
          scheduled_for?: string | null
          snapchat_content_id?: string | null
          snapchat_destination?: string | null
          snapchat_media_id?: string | null
          social_account_id?: string | null
          social_post_destination_id: string
          status?: Database["public"]["Enums"]["destination_status"]
          updated_at?: string
          upload_completed_at?: string | null
          upload_started_at?: string | null
          workspace_id: string
          youtube_bytes_uploaded?: number
          youtube_upload_session?: string | null
          youtube_video_id?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_progress_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          platform?: string
          published_at?: string | null
          publishing_job_id?: string
          remote_status?: string | null
          scheduled_for?: string | null
          snapchat_content_id?: string | null
          snapchat_destination?: string | null
          snapchat_media_id?: string | null
          social_account_id?: string | null
          social_post_destination_id?: string
          status?: Database["public"]["Enums"]["destination_status"]
          updated_at?: string
          upload_completed_at?: string | null
          upload_started_at?: string | null
          workspace_id?: string
          youtube_bytes_uploaded?: number
          youtube_upload_session?: string | null
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publishing_job_destinations_publishing_job_id_fkey"
            columns: ["publishing_job_id"]
            isOneToOne: false
            referencedRelation: "publishing_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publishing_job_destinations_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publishing_job_destinations_social_post_destination_id_fkey"
            columns: ["social_post_destination_id"]
            isOneToOne: false
            referencedRelation: "social_post_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publishing_job_destinations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      publishing_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          job_type: string
          post_id: string
          scheduled_for: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["post_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          job_type?: string
          post_id: string
          scheduled_for?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          job_type?: string
          post_id?: string
          scheduled_for?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publishing_jobs_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publishing_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      snapchat_public_profile_connections: {
        Row: {
          access_token_ciphertext: string | null
          available_profiles: Json
          capabilities: Json
          connected_at: string
          connection_status: string
          created_at: string
          granted_scopes: string[]
          id: string
          last_error_code: string | null
          last_verified_at: string | null
          provider: string
          public_profile_api_available: boolean
          public_profile_id: string | null
          public_profile_name: string | null
          refresh_token_ciphertext: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          access_token_ciphertext?: string | null
          available_profiles?: Json
          capabilities?: Json
          connected_at?: string
          connection_status?: string
          created_at?: string
          granted_scopes?: string[]
          id?: string
          last_error_code?: string | null
          last_verified_at?: string | null
          provider?: string
          public_profile_api_available?: boolean
          public_profile_id?: string | null
          public_profile_name?: string | null
          refresh_token_ciphertext?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          access_token_ciphertext?: string | null
          available_profiles?: Json
          capabilities?: Json
          connected_at?: string
          connection_status?: string
          created_at?: string
          granted_scopes?: string[]
          id?: string
          last_error_code?: string | null
          last_verified_at?: string | null
          provider?: string
          public_profile_api_available?: boolean
          public_profile_id?: string | null
          public_profile_name?: string | null
          refresh_token_ciphertext?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      social_account_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_data: Json
          event_type: string
          id: string
          social_account_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_data?: Json
          event_type: string
          id?: string
          social_account_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_data?: Json
          event_type?: string
          id?: string
          social_account_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_account_events_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_account_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_connections: {
        Row: {
          access_token_ciphertext: string
          account_id: string
          account_name: string
          account_type: string | null
          avatar_url: string | null
          connection_status: string
          created_at: string
          disconnected_at: string | null
          id: string
          is_default: boolean
          last_refresh_at: string | null
          last_refresh_error: string | null
          last_successful_publish_at: string | null
          last_sync_at: string
          metadata: Json
          platform: string
          publishing_eligible: boolean
          publishing_enabled: boolean
          refresh_failure_count: number
          refresh_token_ciphertext: string | null
          scopes: string[]
          token_expires_at: string | null
          updated_at: string
          user_id: string
          username: string | null
          workspace_id: string
        }
        Insert: {
          access_token_ciphertext: string
          account_id: string
          account_name: string
          account_type?: string | null
          avatar_url?: string | null
          connection_status?: string
          created_at?: string
          disconnected_at?: string | null
          id?: string
          is_default?: boolean
          last_refresh_at?: string | null
          last_refresh_error?: string | null
          last_successful_publish_at?: string | null
          last_sync_at?: string
          metadata?: Json
          platform: string
          publishing_eligible?: boolean
          publishing_enabled?: boolean
          refresh_failure_count?: number
          refresh_token_ciphertext?: string | null
          scopes?: string[]
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
          workspace_id: string
        }
        Update: {
          access_token_ciphertext?: string
          account_id?: string
          account_name?: string
          account_type?: string | null
          avatar_url?: string | null
          connection_status?: string
          created_at?: string
          disconnected_at?: string | null
          id?: string
          is_default?: boolean
          last_refresh_at?: string | null
          last_refresh_error?: string | null
          last_successful_publish_at?: string | null
          last_sync_at?: string
          metadata?: Json
          platform?: string
          publishing_eligible?: boolean
          publishing_enabled?: boolean
          refresh_failure_count?: number
          refresh_token_ciphertext?: string | null
          scopes?: string[]
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_destinations: {
        Row: {
          account_label: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          platform: string
          platform_caption: string | null
          platform_description: string | null
          platform_hashtags: string[] | null
          platform_settings: Json
          platform_title: string | null
          post_id: string
          provider_job_id: string | null
          provider_post_id: string | null
          provider_post_url: string | null
          publish_status: Database["public"]["Enums"]["destination_status"]
          published_at: string | null
          social_account_id: string | null
          updated_at: string
          validation_issues: Json
          validation_status: string
          workspace_id: string
        }
        Insert: {
          account_label?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          platform: string
          platform_caption?: string | null
          platform_description?: string | null
          platform_hashtags?: string[] | null
          platform_settings?: Json
          platform_title?: string | null
          post_id: string
          provider_job_id?: string | null
          provider_post_id?: string | null
          provider_post_url?: string | null
          publish_status?: Database["public"]["Enums"]["destination_status"]
          published_at?: string | null
          social_account_id?: string | null
          updated_at?: string
          validation_issues?: Json
          validation_status?: string
          workspace_id: string
        }
        Update: {
          account_label?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          platform?: string
          platform_caption?: string | null
          platform_description?: string | null
          platform_hashtags?: string[] | null
          platform_settings?: Json
          platform_title?: string | null
          post_id?: string
          provider_job_id?: string | null
          provider_post_id?: string | null
          provider_post_url?: string | null
          publish_status?: Database["public"]["Enums"]["destination_status"]
          published_at?: string | null
          social_account_id?: string | null
          updated_at?: string
          validation_issues?: Json
          validation_status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_destinations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_post_destinations_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_post_destinations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_media: {
        Row: {
          alt_text: string | null
          aspect_ratio: number | null
          checksum: string | null
          created_at: string
          duration_seconds: number | null
          file_size: number
          height: number | null
          id: string
          media_type: string
          mime_type: string
          original_filename: string | null
          post_id: string
          processing_status: string
          sort_order: number
          storage_path: string
          thumbnail_path: string | null
          width: number | null
          workspace_id: string
        }
        Insert: {
          alt_text?: string | null
          aspect_ratio?: number | null
          checksum?: string | null
          created_at?: string
          duration_seconds?: number | null
          file_size?: number
          height?: number | null
          id?: string
          media_type: string
          mime_type: string
          original_filename?: string | null
          post_id: string
          processing_status?: string
          sort_order?: number
          storage_path: string
          thumbnail_path?: string | null
          width?: number | null
          workspace_id: string
        }
        Update: {
          alt_text?: string | null
          aspect_ratio?: number | null
          checksum?: string | null
          created_at?: string
          duration_seconds?: number | null
          file_size?: number
          height?: number | null
          id?: string
          media_type?: string
          mime_type?: string
          original_filename?: string | null
          post_id?: string
          processing_status?: string
          sort_order?: number
          storage_path?: string
          thumbnail_path?: string | null
          width?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_post_media_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          base_caption: string
          base_description: string
          base_hashtags: string[]
          created_at: string
          created_by: string
          id: string
          idempotency_key: string | null
          link_url: string | null
          post_type: string
          scheduled_at_utc: string | null
          status: Database["public"]["Enums"]["post_status"]
          timezone: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          base_caption?: string
          base_description?: string
          base_hashtags?: string[]
          created_at?: string
          created_by: string
          id?: string
          idempotency_key?: string | null
          link_url?: string | null
          post_type?: string
          scheduled_at_utc?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          timezone?: string
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          base_caption?: string
          base_description?: string
          base_hashtags?: string[]
          created_at?: string
          created_by?: string
          id?: string
          idempotency_key?: string | null
          link_url?: string | null
          post_type?: string
          scheduled_at_utc?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          timezone?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          default_caption: string
          default_hashtags: string
          default_post_time: string
          default_youtube_visibility: string
          language: string
          notify_account_expiring: boolean
          notify_email: boolean
          notify_failed: boolean
          notify_partial: boolean
          notify_published: boolean
          notify_schedule_approaching: boolean
          notify_storage_limit: boolean
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_caption?: string
          default_hashtags?: string
          default_post_time?: string
          default_youtube_visibility?: string
          language?: string
          notify_account_expiring?: boolean
          notify_email?: boolean
          notify_failed?: boolean
          notify_partial?: boolean
          notify_published?: boolean
          notify_schedule_approaching?: boolean
          notify_storage_limit?: boolean
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_caption?: string
          default_hashtags?: string
          default_post_time?: string
          default_youtube_visibility?: string
          language?: string
          notify_account_expiring?: boolean
          notify_email?: boolean
          notify_failed?: boolean
          notify_partial?: boolean
          notify_published?: boolean
          notify_schedule_approaching?: boolean
          notify_storage_limit?: boolean
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_storage: {
        Row: {
          created_at: string
          storage_limit_bytes: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          storage_limit_bytes?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          storage_limit_bytes?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_storage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_due_publishing_destinations: {
        Args: { _limit: number; _worker: string }
        Returns: {
          attempt_count: number
          created_at: string
          id: string
          last_error_code: string | null
          last_error_message: string | null
          last_progress_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_retry_at: string | null
          platform: string
          published_at: string | null
          publishing_job_id: string
          remote_status: string | null
          scheduled_for: string | null
          snapchat_content_id: string | null
          snapchat_destination: string | null
          snapchat_media_id: string | null
          social_account_id: string | null
          social_post_destination_id: string
          status: Database["public"]["Enums"]["destination_status"]
          updated_at: string
          upload_completed_at: string | null
          upload_started_at: string | null
          workspace_id: string
          youtube_bytes_uploaded: number
          youtube_upload_session: string | null
          youtube_video_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "publishing_job_destinations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      default_workspace_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_workspace_admin: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      recover_stuck_publishing_destinations: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "support" | "member"
      destination_status:
        | "pending"
        | "validating"
        | "queued"
        | "uploading"
        | "processing"
        | "published"
        | "failed"
        | "retry_scheduled"
        | "cancelled"
        | "reconnect_required"
        | "rate_limited"
        | "action_required"
      job_status: "queued" | "running" | "succeeded" | "failed" | "cancelled"
      post_status:
        | "draft"
        | "validating"
        | "queued"
        | "publishing"
        | "published"
        | "partially_published"
        | "failed"
        | "cancelled"
        | "requires_attention"
      workspace_role: "owner" | "admin" | "member"
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
      app_role: ["admin", "support", "member"],
      destination_status: [
        "pending",
        "validating",
        "queued",
        "uploading",
        "processing",
        "published",
        "failed",
        "retry_scheduled",
        "cancelled",
        "reconnect_required",
        "rate_limited",
        "action_required",
      ],
      job_status: ["queued", "running", "succeeded", "failed", "cancelled"],
      post_status: [
        "draft",
        "validating",
        "queued",
        "publishing",
        "published",
        "partially_published",
        "failed",
        "cancelled",
        "requires_attention",
      ],
      workspace_role: ["owner", "admin", "member"],
    },
  },
} as const


import { createClient } from "@/lib/supabase/client";

export type VideoSettingsRecord = {
  id: string;
  font_size: number;
  font_color: string;
  outline_color: string;
  background_color: string;
  background_opacity: number;
  subtitle_position: string;
  font_family: string;
  settings: Record<string, unknown>;
  updated_at: string;
  owner_id: string;
};

export async function getVideoSettings() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("video_settings")
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`โหลดการตั้งค่าซับไม่สำเร็จ: ${error.message}`);
  }

  return data as VideoSettingsRecord | null;
}

export async function saveVideoSettings(
  settings: Record<string, unknown>
) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("video_settings")
    .upsert(
      {
        settings,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "owner_id",
      }
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`บันทึกการตั้งค่าซับไม่สำเร็จ: ${error.message}`);
  }

  return data as VideoSettingsRecord;
}

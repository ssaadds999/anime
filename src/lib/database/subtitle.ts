
import { createClient } from "@/lib/supabase/client";

export type SubtitleRecord = {
  id: string;
  episode_id: string;
  subtitle_number: number;
  start_time: string;
  end_time: string;
  original_text: string;
  translated_text: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  owner_id: string;
};

export type SubtitleInput = {
  subtitle_number: number;
  start_time: string;
  end_time: string;
  original_text: string;
  translated_text?: string;
  status?: string;
};

export async function getSubtitles(episodeId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("subtitles")
    .select("*")
    .eq("episode_id", episodeId)
    .order("subtitle_number", { ascending: true });

  if (error) {
    throw new Error(`โหลดซับไตเติลไม่สำเร็จ: ${error.message}`);
  }

  return data as SubtitleRecord[];
}

export async function saveSubtitles(
  episodeId: string,
  subtitles: SubtitleInput[]
) {
  const supabase = createClient();

  // ลบข้อมูลเดิมของตอนนี้ก่อนบันทึกชุดใหม่
  const { error: deleteError } = await supabase
    .from("subtitles")
    .delete()
    .eq("episode_id", episodeId);

  if (deleteError) {
    throw new Error(`ลบซับไตเติลเดิมไม่สำเร็จ: ${deleteError.message}`);
  }

  if (subtitles.length === 0) {
    return [];
  }

  const rows = subtitles.map((subtitle) => ({
    episode_id: episodeId,
    subtitle_number: subtitle.subtitle_number,
    start_time: subtitle.start_time,
    end_time: subtitle.end_time,
    original_text: subtitle.original_text,
    translated_text: subtitle.translated_text ?? "",
    status: subtitle.status ?? "pending",
  }));

  const { data, error } = await supabase
    .from("subtitles")
    .insert(rows)
    .select("*");

  if (error) {
    throw new Error(`บันทึกซับไตเติลไม่สำเร็จ: ${error.message}`);
  }

  return data as SubtitleRecord[];
}

export async function updateSubtitle(
  id: string,
  updates: Partial<
    Pick<
      SubtitleRecord,
      | "subtitle_number"
      | "start_time"
      | "end_time"
      | "original_text"
      | "translated_text"
      | "status"
    >
  >
) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("subtitles")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`แก้ไขซับไตเติลไม่สำเร็จ: ${error.message}`);
  }

  return data as SubtitleRecord;
}

export async function deleteSubtitles(episodeId: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from("subtitles")
    .delete()
    .eq("episode_id", episodeId);

  if (error) {
    throw new Error(`ลบซับไตเติลไม่สำเร็จ: ${error.message}`);
  }
}


import { createClient } from "@/lib/supabase/client";

export type EpisodeRecord = {
  id: string;
  season_id: string;
  episode_number: number;
  title: string | null;
  description: string | null;
  video_url: string | null;
  subtitle_url: string | null;
  file_name: string | null;
  saved_at: string | null;
  created_at: string;
  updated_at: string;
  owner_id: string;
};

export async function getEpisodes(seasonId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("episodes")
    .select("*")
    .eq("season_id", seasonId)
    .order("episode_number", { ascending: true });

  if (error) {
    throw new Error(`โหลดรายการตอนไม่สำเร็จ: ${error.message}`);
  }

  return data as EpisodeRecord[];
}

export async function createEpisode(
  seasonId: string,
  episodeNumber: number,
  title?: string,
  fileName?: string
) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("episodes")
    .insert({
      season_id: seasonId,
      episode_number: episodeNumber,
      title: title?.trim() || `ตอนที่ ${episodeNumber}`,
      file_name: fileName?.trim() || null,
      saved_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`เพิ่มตอนไม่สำเร็จ: ${error.message}`);
  }

  return data as EpisodeRecord;
}

export async function updateEpisode(
  id: string,
  updates: Partial<
    Pick<
      EpisodeRecord,
      | "episode_number"
      | "title"
      | "description"
      | "video_url"
      | "subtitle_url"
      | "file_name"
      | "saved_at"
    >
  >
) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("episodes")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`แก้ไขตอนไม่สำเร็จ: ${error.message}`);
  }

  return data as EpisodeRecord;
}

export async function deleteEpisode(id: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from("episodes")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`ลบตอนไม่สำเร็จ: ${error.message}`);
  }
}

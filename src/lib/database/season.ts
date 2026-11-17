
import { createClient } from "@/lib/supabase/client";

export type SeasonRecord = {
  id: string;
  anime_id: string;
  season_number: number;
  title: string | null;
  description: string | null;
  created_at: string;
  owner_id: string;
};

export async function getSeasons(animeId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("seasons")
    .select("*")
    .eq("anime_id", animeId)
    .order("season_number", { ascending: true });

  if (error) {
    throw new Error(`โหลดซีซันไม่สำเร็จ: ${error.message}`);
  }

  return data as SeasonRecord[];
}

export async function createSeason(
  animeId: string,
  seasonNumber: number,
  title?: string,
  description?: string
) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("seasons")
    .insert({
      anime_id: animeId,
      season_number: seasonNumber,
      title: title?.trim() || `ซีซัน ${seasonNumber}`,
      description: description?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`เพิ่มซีซันไม่สำเร็จ: ${error.message}`);
  }

  return data as SeasonRecord;
}

export async function updateSeason(
  id: string,
  updates: Partial<
    Pick<SeasonRecord, "season_number" | "title" | "description">
  >
) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("seasons")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`แก้ไขซีซันไม่สำเร็จ: ${error.message}`);
  }

  return data as SeasonRecord;
}

export async function deleteSeason(id: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from("seasons")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`ลบซีซันไม่สำเร็จ: ${error.message}`);
  }
}

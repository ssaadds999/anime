
import { createClient } from "@/lib/supabase/client";

export type AnimeRecord = {
  id: string;
  title: string;
  original_title: string | null;
  cover_url: string | null;
  genre: string | null;
  story_context: string | null;
  ai_notes: string | null;
  created_at: string;
  updated_at: string;
  owner_id: string;
};

export async function getAnimes() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("animes")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`โหลดรายการอนิเมะไม่สำเร็จ: ${error.message}`);
  }

  return data as AnimeRecord[];
}

export async function createAnime(title: string) {
  const supabase = createClient();

  const cleanTitle = title.trim();

  if (!cleanTitle) {
    throw new Error("กรุณาระบุชื่ออนิเมะ");
  }

  const { data, error } = await supabase
    .from("animes")
    .insert({ title: cleanTitle })
    .select("*")
    .single();

  if (error) {
    throw new Error(`เพิ่มอนิเมะไม่สำเร็จ: ${error.message}`);
  }

  return data as AnimeRecord;
}

export async function updateAnime(
  id: string,
  updates: Partial<
    Pick<
      AnimeRecord,
      "title" | "original_title" | "cover_url" | "genre" | "story_context" | "ai_notes"
    >
  >
) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("animes")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`แก้ไขข้อมูลอนิเมะไม่สำเร็จ: ${error.message}`);
  }

  return data as AnimeRecord;
}

export async function deleteAnime(id: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from("animes")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`ลบอนิเมะไม่สำเร็จ: ${error.message}`);
  }
}

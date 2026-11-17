
import { createClient } from "@/lib/supabase/client";

export type GlossaryRecord = {
  id: string;
  anime_id: string;
  source_term: string;
  translated_term: string;
  category: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  owner_id: string;
};

export type GlossaryInput = {
  source_term: string;
  translated_term: string;
  category?: string;
  note?: string;
};

export async function getGlossary(animeId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("glossary")
    .select("*")
    .eq("anime_id", animeId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`โหลดคลังคำศัพท์ไม่สำเร็จ: ${error.message}`);
  }

  return data as GlossaryRecord[];
}

export async function createGlossaryItem(
  animeId: string,
  item: GlossaryInput
) {
  const supabase = createClient();

  if (!item.source_term.trim() || !item.translated_term.trim()) {
    throw new Error("กรุณาระบุคำต้นฉบับและคำแปล");
  }

  const { data, error } = await supabase
    .from("glossary")
    .insert({
      anime_id: animeId,
      source_term: item.source_term.trim(),
      translated_term: item.translated_term.trim(),
      category: item.category?.trim() || null,
      note: item.note?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`เพิ่มคำศัพท์ไม่สำเร็จ: ${error.message}`);
  }

  return data as GlossaryRecord;
}

export async function updateGlossaryItem(
  id: string,
  updates: Partial<GlossaryInput>
) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("glossary")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`แก้ไขคำศัพท์ไม่สำเร็จ: ${error.message}`);
  }

  return data as GlossaryRecord;
}

export async function deleteGlossaryItem(id: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from("glossary")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`ลบคำศัพท์ไม่สำเร็จ: ${error.message}`);
  }
}

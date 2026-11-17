
import { createClient } from "@/lib/supabase/client";

export type CharacterRecord = {
  id: string;
  anime_id: string;
  name: string;
  original_name: string | null;
  aliases: string[] | null;
  description: string | null;
  pronoun: string | null;
  speech_style: string | null;
  relationships: string | null;
  created_at: string;
  updated_at: string;
  owner_id: string;
};

export type CharacterInput = {
  name: string;
  original_name?: string;
  aliases?: string[];
  description?: string;
  pronoun?: string;
  speech_style?: string;
  relationships?: string;
};

export async function getCharacters(animeId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("characters")
    .select("*")
    .eq("anime_id", animeId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`โหลดข้อมูลตัวละครไม่สำเร็จ: ${error.message}`);
  }

  return data as CharacterRecord[];
}

export async function createCharacter(
  animeId: string,
  character: CharacterInput
) {
  const supabase = createClient();

  if (!character.name.trim()) {
    throw new Error("กรุณาระบุชื่อตัวละคร");
  }

  const { data, error } = await supabase
    .from("characters")
    .insert({
      anime_id: animeId,
      name: character.name.trim(),
      original_name: character.original_name?.trim() || null,
      aliases: character.aliases ?? [],
      description: character.description?.trim() || null,
      pronoun: character.pronoun?.trim() || null,
      speech_style: character.speech_style?.trim() || null,
      relationships: character.relationships?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`เพิ่มตัวละครไม่สำเร็จ: ${error.message}`);
  }

  return data as CharacterRecord;
}

export async function updateCharacter(
  id: string,
  updates: Partial<CharacterInput>
) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("characters")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`แก้ไขตัวละครไม่สำเร็จ: ${error.message}`);
  }

  return data as CharacterRecord;
}

export async function deleteCharacter(id: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from("characters")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`ลบตัวละครไม่สำเร็จ: ${error.message}`);
  }
}

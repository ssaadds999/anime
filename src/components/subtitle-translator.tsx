"use client";

import {
  getVideoSettings,
  saveVideoSettings,
} from "@/lib/database/video-settings";

import { createClient } from "@/lib/supabase/client";



import { useEffect, useMemo, useRef, useState } from "react";



import {



  parseSRT,



  buildSRT,



  type SubtitleEntry,



} from "@/lib/srt";



import {



  Upload, Languages, Download, FileText, Loader2, CheckCircle2,



  AlertCircle, X, Search, Pencil, Plus, Trash2, Users, BookOpen,



  FolderOpen, Save, Video, Film,



} from "lucide-react";







type Character = {



  id: string;



  name: string;



  description: string;



  pronoun: string;



  speakingStyle: string;



  relationships: string;



};







type GlossaryItem = {



  id: string;



  original: string;



  translation: string;



  note: string;



};







type SavedEpisode = {
  id: string;
  title: string;
  fileName: string;
  entries: SubtitleEntry[];
  translations: Record<number, string>;
  savedAt: string;
};

type ProjectData = {
  context: string;
  characters: Character[];
  glossary: GlossaryItem[];
  episodes: SavedEpisode[];
};


type VideoSubtitleSettings = {
  maskEnabled: boolean;
  maskHeight: number;
  maskBottom: number;
  maskWidth: number;
  maskColor: string;
  maskOpacity: number;
  maskRadius: number;
  thaiEnabled: boolean;
  thaiFontSize: number;
  thaiFontFamily: string;
  thaiColor: string;
  thaiStrokeColor: string;
  thaiStrokeWidth: number;
  thaiShadow: boolean;
  thaiBottom: number;
};

const DEFAULT_VIDEO_SUBTITLE_SETTINGS: VideoSubtitleSettings = {
  maskEnabled: true,
  maskHeight: 10,
  maskBottom: 4,
  maskWidth: 94,
  maskColor: "#000000",
  maskOpacity: 0.82,
  maskRadius: 6,
  thaiEnabled: true,
  thaiFontSize: 26,
  thaiFontFamily: "sans-serif",
  thaiColor: "#ffffff",
  thaiStrokeColor: "#000000",
  thaiStrokeWidth: 1.5,
  thaiShadow: true,
  thaiBottom: 5,
};







const EMPTY_PROJECT: ProjectData = {
  context: "",
  characters: [],
  glossary: [],
  episodes: [],
};







const STORAGE_KEY = "anime-subtitle-translator-projects-v1";



function timestampToSeconds(value: string) {

  const [hours, minutes, seconds] = value.replace(",", ".").split(":");

  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);

}







export default function SubtitleTranslator() {

    async function toggleVideoFullscreen() {
  const container = videoContainerRef.current;
  if (!container) return;

  try {
    if (document.fullscreenElement === container) {
      await document.exitFullscreen();
    } else {
      await container.requestFullscreen();
    }
  } catch {
    setError("ไม่สามารถเปิดโหมดเต็มจอได้");
  }
}


  const inputRef = useRef<HTMLInputElement>(null);



  const backupInputRef = useRef<HTMLInputElement>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  const videoContainerRef = useRef<HTMLDivElement>(null);

  const videoStageRef = useRef<HTMLDivElement>(null);

  const [videoContentRect, setVideoContentRect] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });

  const [subtitleSettings, setSubtitleSettings] = useState<VideoSubtitleSettings>(
    DEFAULT_VIDEO_SUBTITLE_SETTINGS
  );
  const [subtitleSettingsHydrated, setSubtitleSettingsHydrated] = useState(false);

  const [videoFile, setVideoFile] = useState<File | null>(null);

  const [videoUrl, setVideoUrl] = useState("");

  const [videoTime, setVideoTime] = useState(0);

  const [playbackRate, setPlaybackRate] = useState(1);



  const [entries, setEntries] = useState<SubtitleEntry[]>([]);



  const [fileName, setFileName] = useState("");



  const [translations, setTranslations] = useState<Record<number, string>>({});



  const [loading, setLoading] = useState(false);



  const [progress, setProgress] = useState(0);



  const [error, setError] = useState("");



  const [success, setSuccess] = useState(false);



  const [search, setSearch] = useState("");
  const [showAllSubtitles, setShowAllSubtitles] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);







  const [projectName, setProjectName] = useState("โปรเจกต์ใหม่");

  const [animeIds, setAnimeIds] = useState<Record<string, string>>({});


  const [projects, setProjects] = useState<Record<string, ProjectData>>({



    "โปรเจกต์ใหม่": EMPTY_PROJECT,



  });



  const [hydrated, setHydrated] = useState(false);



  const [activeTab, setActiveTab] = useState<"characters" | "glossary">("characters");



  const [backupMessage, setBackupMessage] = useState("");







  const [characterForm, setCharacterForm] = useState<Character | null>(null);



  const [glossaryForm, setGlossaryForm] = useState<GlossaryItem | null>(null);







const activeProject = projects[projectName] ?? EMPTY_PROJECT;
const savedEpisodes = activeProject.episodes ?? [];

  useEffect(() => {
    const animeId = animeIds[projectName];

    if (!hydrated || !animeId) return;

    let cancelled = false;

    async function loadProjectMemory() {
      try {
        const supabase = createClient();

        const [charactersResult, glossaryResult, seasonsResult] = await Promise.all([
          supabase
            .from("characters")
            .select("*")
            .eq("anime_id", animeId),
          supabase
            .from("glossary")
            .select("*")
            .eq("anime_id", animeId),
          supabase
            .from("seasons")
            .select("id")
            .eq("anime_id", animeId),
        ]);

        if (charactersResult.error) throw charactersResult.error;
        if (glossaryResult.error) throw glossaryResult.error;
        if (seasonsResult.error) throw seasonsResult.error;

        const seasonIds = (seasonsResult.data ?? []).map((season) => season.id);
        let episodes: SavedEpisode[] = [];

        if (seasonIds.length > 0) {
          const { data: episodeRows, error: episodesError } = await supabase
            .from("episodes")
            .select("*")
            .in("season_id", seasonIds)
            .order("episode_number", { ascending: true });

          if (episodesError) throw episodesError;

          const episodeIds = (episodeRows ?? []).map((episode) => episode.id);
          let subtitleRows: Array<{
            episode_id: string;
            subtitle_number: number;
            start_time: string;
            end_time: string;
            original_text: string;
            translated_text: string | null;
          }> = [];

          if (episodeIds.length > 0) {
            const { data, error: subtitlesError } = await supabase
              .from("subtitles")
              .select("episode_id, subtitle_number, start_time, end_time, original_text, translated_text")
              .in("episode_id", episodeIds)
              .order("subtitle_number", { ascending: true });

            if (subtitlesError) throw subtitlesError;
            subtitleRows = data ?? [];
          }

          episodes = (episodeRows ?? []).map((episode) => {
            const rows = subtitleRows.filter((row) => row.episode_id === episode.id);
            const entries: SubtitleEntry[] = rows.map((row) => ({
              id: Number(row.subtitle_number),
              start: row.start_time,
              end: row.end_time,
              text: row.original_text ?? "",
            }));
            const translations: Record<number, string> = {};
            for (const row of rows) {
              translations[Number(row.subtitle_number)] = row.translated_text ?? "";
            }

            return {
              id: episode.id,
              title: episode.title ?? "ไม่มีชื่อตอน",
              fileName: episode.file_name ?? `${episode.title ?? "episode"}.srt`,
              entries,
              translations,
              savedAt: episode.saved_at ?? episode.created_at ?? "",
            };
          });
        }

        if (cancelled) return;

        const characters: Character[] = (charactersResult.data ?? []).map(
          (item) => ({
            id: item.id,
            name: item.name ?? "",
            description: item.description ?? "",
            pronoun: item.pronoun ?? "",
            speakingStyle: item.speech_style ?? "",
            relationships: item.relationships ?? "",
          })
        );

        const glossary: GlossaryItem[] = (glossaryResult.data ?? []).map(
          (item) => ({
            id: item.id,
            original: item.source_term ?? "",
            translation: item.translated_term ?? "",
            note: item.note ?? "",
          })
        );

        setProjects((previous) => ({
          ...previous,
          [projectName]: {
            ...(previous[projectName] ?? EMPTY_PROJECT),
            characters,
            glossary,
            episodes,
          },
        }));
      } catch (err) {
        console.error("Load project memory error:", err);

        if (!cancelled) {
          setError("ไม่สามารถโหลดข้อมูลตัวละครและคลังคำศัพท์ได้");
        }
      }
    }

    loadProjectMemory();

    return () => {
      cancelled = true;
    };
  }, [projectName, animeIds, hydrated]);


  useEffect(() => {
    const animeId = animeIds[projectName];

    if (!hydrated || !animeId) return;

    const timer = setTimeout(async () => {
      try {
        const supabase = createClient();

        const { error } = await supabase
          .from("animes")
          .update({
            story_context: activeProject.context,
          })
          .eq("id", animeId);

        if (error) throw error;
      } catch (err) {
        console.error("Save anime context error:", err);
        setError("บันทึกบริบทอนิเมะไม่สำเร็จ");
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [activeProject.context, projectName, animeIds, hydrated]);

const translatedCount = Object.keys(translations).length;



  // Load saved anime projects once when the app opens.



  // Load anime projects from Supabase.
useEffect(() => {
  let cancelled = false;

  async function loadProjects() {
    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from("animes")
        .select("id, title, story_context")
        .order("created_at", { ascending: true });

      if (error) throw error;

      if (cancelled) return;

      const nextProjects: Record<string, ProjectData> = {};
      const nextAnimeIds: Record<string, string> = {};

      for (const anime of data ?? []) {
        let key = anime.title;
        let suffix = 2;

        while (nextProjects[key]) {
          key = `${anime.title} (${suffix})`;
          suffix++;
        }

        nextProjects[key] = {
          ...EMPTY_PROJECT,
          context: anime.story_context ?? "",
        };

        nextAnimeIds[key] = anime.id;
      }

      setProjects(nextProjects);
      setAnimeIds(nextAnimeIds);

      const firstProject = Object.keys(nextProjects)[0] ?? "";
      setProjectName(firstProject);
    } catch (err) {
      console.error("Could not load anime projects:", err);

      if (!cancelled) {
        setError(
          err instanceof Error
            ? err.message
            : "ไม่สามารถโหลดโปรเจกต์จากฐานข้อมูลได้"
        );
      }
    } finally {
      if (!cancelled) {
        setHydrated(true);
      }
    }
  }

  loadProjects();

  return () => {
    cancelled = true;
  };
}, []);







  useEffect(() => {

    if (!videoFile) {

      setVideoUrl("");

      return;

    }



    const url = URL.createObjectURL(videoFile);

    setVideoUrl(url);

    return () => URL.revokeObjectURL(url);

  }, [videoFile]);



  const activeSubtitle = useMemo(() => {
    return entries.find((entry) => {
      const start = timestampToSeconds(entry.start);
      const end = timestampToSeconds(entry.end);
      return videoTime >= start && videoTime <= end;
    });
  }, [entries, videoTime]);


  // Measure the actual video picture area (not the player/container letterbox).
  // This keeps the mask and Thai text aligned for 16:9, 4:3 and fullscreen layouts.
  useEffect(() => {
    const video = videoRef.current;
    const stage = videoStageRef.current;
    if (!video || !stage) {
      setVideoContentRect({ left: 0, top: 0, width: 0, height: 0 });
      return;
    }

    const measureVideoContent = () => {
      const stageRect = stage.getBoundingClientRect();
      const videoRect = video.getBoundingClientRect();
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;

      if (!sourceWidth || !sourceHeight || !videoRect.width || !videoRect.height) {
        setVideoContentRect({ left: 0, top: 0, width: 0, height: 0 });
        return;
      }

      const scale = Math.min(
        videoRect.width / sourceWidth,
        videoRect.height / sourceHeight
      );
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      const left = videoRect.left - stageRect.left + (videoRect.width - width) / 2;
      const top = videoRect.top - stageRect.top + (videoRect.height - height) / 2;

      setVideoContentRect((previous) => {
        if (
          Math.abs(previous.left - left) < 0.5 &&
          Math.abs(previous.top - top) < 0.5 &&
          Math.abs(previous.width - width) < 0.5 &&
          Math.abs(previous.height - height) < 0.5
        ) return previous;
        return { left, top, width, height };
      });
    };

    measureVideoContent();
    const observer = new ResizeObserver(measureVideoContent);
    observer.observe(stage);
    observer.observe(video);
    video.addEventListener("loadedmetadata", measureVideoContent);
    video.addEventListener("loadeddata", measureVideoContent);
    window.addEventListener("resize", measureVideoContent);
    document.addEventListener("fullscreenchange", measureVideoContent);

    return () => {
      observer.disconnect();
      video.removeEventListener("loadedmetadata", measureVideoContent);
      video.removeEventListener("loadeddata", measureVideoContent);
      window.removeEventListener("resize", measureVideoContent);
      document.removeEventListener("fullscreenchange", measureVideoContent);
    };
  }, [videoUrl]);

 // Load subtitle appearance preferences from Supabase.
useEffect(() => {
  let cancelled = false;

  async function loadSettings() {
    try {
      const saved = await getVideoSettings();

      if (
        !cancelled &&
        saved?.settings &&
        typeof saved.settings === "object"
      ) {
        setSubtitleSettings({
          ...DEFAULT_VIDEO_SUBTITLE_SETTINGS,
          ...saved.settings,
        });
      }
    } catch (err) {
      console.error("Could not load video settings:", err);
      if (!cancelled) {
        setError("ไม่สามารถโหลดการตั้งค่าซับจากฐานข้อมูลได้");
      }
    } finally {
      if (!cancelled) {
        setSubtitleSettingsHydrated(true);
      }
    }
  }

  loadSettings();

  return () => {
    cancelled = true;
  };
}, []);

// Save subtitle settings to Supabase.
useEffect(() => {
  if (!subtitleSettingsHydrated) return;

  const timer = setTimeout(async () => {
    try {
      await saveVideoSettings(subtitleSettings);
    } catch (err) {
      console.error("Could not save video settings:", err);
      setError("ไม่สามารถบันทึกการตั้งค่าซับลงฐานข้อมูลได้");
    }
  }, 500);

  return () => clearTimeout(timer);
}, [subtitleSettings, subtitleSettingsHydrated]);


  function updateSubtitleSettings(patch: Partial<VideoSubtitleSettings>) {
    setSubtitleSettings((previous) => ({ ...previous, ...patch }));
  }







  


   


 







  
  function updateActiveProject(patch: Partial<ProjectData>) {
    setProjects((previous) => ({
      ...previous,
      [projectName]: {
        ...(previous[projectName] ?? EMPTY_PROJECT),
        ...patch,
      },
    }));
  }

  async function createProject() {
    const name = window.prompt("ตั้งชื่อโปรเจกต์อนิเมะ");
    if (!name?.trim()) return;

    const cleanName = name.trim();

    if (projects[cleanName]) {
      setProjectName(cleanName);
      return;
    }

    try {
      setError("");

      const supabase = createClient();
      const { data, error } = await supabase
        .from("animes")
        .insert({
          title: cleanName,
          story_context: "",
        })
        .select("id, title, story_context")
        .single();

      if (error) throw error;

      setProjects((previous) => ({
        ...previous,
        [cleanName]: { ...EMPTY_PROJECT },
      }));

      setAnimeIds((previous) => ({
        ...previous,
        [cleanName]: data.id,
      }));

      setProjectName(cleanName);
      setCharacterForm(null);
      setGlossaryForm(null);
    } catch (err) {
      console.error("Create project error:", err);
      setError(
        err instanceof Error ? err.message : "สร้างโปรเจกต์ไม่สำเร็จ"
      );
    }
  }

  async function renameProject() {
    const name = window.prompt("เปลี่ยนชื่อโปรเจกต์", projectName);
    if (!name?.trim() || name.trim() === projectName) return;

    const cleanName = name.trim();

    if (projects[cleanName]) {
      setError("มีโปรเจกต์ชื่อนี้อยู่แล้ว");
      return;
    }

    const animeId = animeIds[projectName];

    if (!animeId) {
      setError("ไม่พบ ID ของโปรเจกต์");
      return;
    }

    try {
      setError("");

      const supabase = createClient();
      const { error } = await supabase
        .from("animes")
        .update({ title: cleanName })
        .eq("id", animeId);

      if (error) throw error;

      setProjects((previous) => {
        const next = { ...previous };
        next[cleanName] = next[projectName];
        delete next[projectName];
        return next;
      });

      setAnimeIds((previous) => {
        const next = { ...previous };
        next[cleanName] = next[projectName];
        delete next[projectName];
        return next;
      });

      setProjectName(cleanName);
    } catch (err) {
      console.error("Rename project error:", err);
      setError(
        err instanceof Error ? err.message : "เปลี่ยนชื่อโปรเจกต์ไม่สำเร็จ"
      );
    }
  }

  async function deleteProject() {
    if (Object.keys(projects).length <= 1) {
      setError("ต้องเหลืออย่างน้อยหนึ่งโปรเจกต์");
      return;
    }

    if (
      !window.confirm(
        `ลบโปรเจกต์ "${projectName}" และข้อมูลที่เกี่ยวข้องทั้งหมดหรือไม่?`
      )
    ) {
      return;
    }

    const animeId = animeIds[projectName];

    if (!animeId) {
      setError("ไม่พบ ID ของโปรเจกต์");
      return;
    }

    try {
      setError("");

      const supabase = createClient();
      const { error } = await supabase
        .from("animes")
        .delete()
        .eq("id", animeId);

      if (error) throw error;

      const nextProjects = { ...projects };
      delete nextProjects[projectName];

      const nextAnimeIds = { ...animeIds };
      delete nextAnimeIds[projectName];

      setProjects(nextProjects);
      setAnimeIds(nextAnimeIds);
      setProjectName(Object.keys(nextProjects)[0]);
    } catch (err) {
      console.error("Delete project error:", err);
      setError(
        err instanceof Error ? err.message : "ลบโปรเจกต์ไม่สำเร็จ"
      );
    }
  }







  function exportBackup() {



    const backup = {



      format: "anime-subtitle-translator-backup",



      version: 1,



      exportedAt: new Date().toISOString(),



      currentProject: projectName,



      projects,



    };



    const blob = new Blob([JSON.stringify(backup, null, 2)], {



      type: "application/json;charset=utf-8",



    });



    const url = URL.createObjectURL(blob);



    const link = document.createElement("a");



    link.href = url;



    link.download = `anime-translator-backup-${new Date().toISOString().slice(0, 10)}.json`;



    document.body.appendChild(link);



    link.click();



    link.remove();



    setTimeout(() => URL.revokeObjectURL(url), 1000);



    setBackupMessage("ส่งออกข้อมูลสำรองเรียบร้อยแล้ว");



  }







  async function importBackup(file?: File) {



    if (!file) return;



    setBackupMessage("");



    try {



      const parsed = JSON.parse(await file.text());



      if (



        parsed?.format !== "anime-subtitle-translator-backup" ||



        !parsed.projects ||



        typeof parsed.projects !== "object" ||



        Array.isArray(parsed.projects)



      ) {



        throw new Error("ไฟล์นี้ไม่ใช่ไฟล์สำรองของ Anime Subtitle Translator");



      }







      const validProjects = Object.entries(parsed.projects).filter(([, value]) => {



        const project = value as Partial<ProjectData>;



        return (



          project &&



          typeof project === "object" &&



          typeof project.context === "string" &&



          Array.isArray(project.characters) &&



          Array.isArray(project.glossary)



        );



      }) as [string, ProjectData][];







      if (validProjects.length === 0) {



        throw new Error("ไม่พบข้อมูลโปรเจกต์ที่ถูกต้องในไฟล์นี้");



      }







      const added = validProjects.filter(([name]) => !projects[name]);



      if (added.length === 0) {



        setBackupMessage("ไม่มีโปรเจกต์ใหม่ให้นำเข้า (ชื่อโปรเจกต์ทั้งหมดมีอยู่แล้ว)");



        return;



      }







      setProjects((previous) => {



        const next = { ...previous };



        for (const [name, project] of added) {
            next[name] = { ...EMPTY_PROJECT, ...project, episodes: project.episodes ?? [] };
          }



        return next;



      });



      setProjectName(added[0][0]);



      setCharacterForm(null);



      setGlossaryForm(null);



      setBackupMessage(`นำเข้า ${added.length} โปรเจกต์สำเร็จ · ข้าม ${validProjects.length - added.length} โปรเจกต์ที่มีชื่อซ้ำ`);



    } catch (err) {



      setBackupMessage(err instanceof Error ? err.message : "ไม่สามารถนำเข้าไฟล์สำรองได้");



    } finally {



      if (backupInputRef.current) backupInputRef.current.value = "";



    }



  }







  const filteredEntries = useMemo(() => {



    const keyword = search.toLowerCase().trim();



    if (!keyword) return entries;



    return entries.filter((entry) => {



      const original = entry.text.toLowerCase();



      const translated = (translations[entry.id] || "").toLowerCase();



      return original.includes(keyword) || translated.includes(keyword) || String(entry.id).includes(keyword);



    });



  }, [entries, translations, search]);

  const visibleEntries = showAllSubtitles || search.trim()
    ? filteredEntries
    : filteredEntries.slice(0, 6);

  function handleVideoFile(file?: File) {

    if (!file) return;

        if (!file.type.startsWith("video/") && !/\.(mp4|webm|ogv|mov|m4v|mkv)$/i.test(file.name)) {

      setError("กรุณาเลือกไฟล์วิดีโอ เช่น MP4, WebM หรือ MKV");

      return;

    }

    setError("");

    setVideoFile(file);

    setVideoTime(0);

  }



  function seekToSubtitle(entry: SubtitleEntry) {

    if (!videoRef.current || !videoUrl) return;

    videoRef.current.currentTime = timestampToSeconds(entry.start);

    setVideoTime(videoRef.current.currentTime);

  }



  async function handleFile(file?: File) {



    if (!file) return;



    setError("");



    setSuccess(false);



    setTranslations({});



    setSearch("");



    if (!file.name.toLowerCase().endsWith(".srt")) {



      setError("ตอนนี้รองรับเฉพาะไฟล์ .srt");



      return;



    }



    try {



      const buffer = await file.arrayBuffer();



      let content: string;



      try {



        content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);



      } catch {



        content = new TextDecoder("windows-874").decode(buffer);



      }



      const parsed = parseSRT(content);



      setEntries(parsed);



      setFileName(file.name);



      setProgress(0);



    } catch (err) {



      setError(err instanceof Error ? err.message : "ไม่สามารถอ่านไฟล์ได้");



    }



  }







  async function translateAll() {



    if (entries.length === 0 || loading) return;



    setLoading(true);



    setError("");



    setSuccess(false);



    setProgress(0);



    const result: Record<number, string> = {};



    const batchSize = 30;



    const totalBatches = Math.ceil(entries.length / batchSize);







    try {



      for (let i = 0; i < entries.length; i += batchSize) {



        const batch = entries.slice(i, i + batchSize);



        const response = await fetch("/api/translate", {



          method: "POST",



          headers: { "Content-Type": "application/json" },



          body: JSON.stringify({



            entries: batch.map((entry) => ({ id: entry.id, text: entry.text })),



            characters: activeProject.characters,



            glossary: activeProject.glossary,



            context: activeProject.context,



          }),



        });



        const data = await response.json();



        if (!response.ok) throw new Error(data.error || "เกิดข้อผิดพลาดในการแปล");



        if (!Array.isArray(data.translations)) throw new Error("รูปแบบคำแปลจาก AI ไม่ถูกต้อง");



        for (const item of data.translations) result[item.id] = item.text;



        setTranslations({ ...result });



        setProgress(Math.round(((i / batchSize + 1) / totalBatches) * 100));



      }



      setSuccess(true);



    } catch (err) {



      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการแปล");



    } finally {



      setLoading(false);



    }



  }







  function updateTranslation(id: number, text: string) {



    setTranslations((previous) => ({ ...previous, [id]: text }));



  }







  function downloadSRT() {



    if (entries.length === 0) return;



    const content = buildSRT(entries, translations);



    const blob = new Blob(["\uFEFF", content], { type: "text/plain;charset=utf-8" });



    const url = URL.createObjectURL(blob);



    const link = document.createElement("a");



    link.href = url;



    link.download = `${fileName.replace(/\.srt$/i, "")}_TH.srt`;



    document.body.appendChild(link);



    link.click();



    link.remove();



    setTimeout(() => URL.revokeObjectURL(url), 1000);



  }







  
  async function saveEpisode() {
    if (entries.length === 0) {
      setError("กรุณาเปิดไฟล์ SRT ก่อนบันทึกตอน");
      return;
    }

    const animeId = animeIds[projectName];
    if (!animeId) {
      setError("ไม่พบโปรเจกต์ในฐานข้อมูล");
      return;
    }

    const suggestedTitle = fileName.replace(/\\.srt$/i, "");
    const title = window.prompt("ตั้งชื่อตอน", suggestedTitle);
    if (!title?.trim()) return;

    let createdEpisodeId: string | null = null;

    try {
      setError("");
      const supabase = createClient();

      // episodes ต้องผูกกับ season ผ่าน season_id
      // ใช้ซีซันแรกของอนิเมะนี้ หรือสร้างให้หากยังไม่มี
      const { data: existingSeason, error: seasonLookupError } = await supabase
        .from("seasons")
        .select("id")
        .eq("anime_id", animeId)
        .order("season_number", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (seasonLookupError) throw seasonLookupError;

      let seasonId = existingSeason?.id;

      if (!seasonId) {
        const { data: newSeason, error: seasonCreateError } = await supabase
          .from("seasons")
          .insert({
            anime_id: animeId,
            season_number: 1,
            title: "ซีซัน 1",
          })
          .select("id")
          .single();

        if (seasonCreateError) throw seasonCreateError;
        seasonId = newSeason.id;
      }

      // สร้างข้อมูลตอน โดยผูกกับซีซันจริง ไม่ส่ง season_id เป็น null
      const { data: episodeData, error: episodeError } = await supabase
        .from("episodes")
        .insert({
          season_id: seasonId,
          episode_number: savedEpisodes.length + 1,
          title: title.trim(),
          file_name: fileName,
          saved_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (episodeError) throw episodeError;
      createdEpisodeId = episodeData.id;

      const subtitleRows = entries.map((entry) => ({
        episode_id: episodeData.id,
        subtitle_number: entry.id,
        start_time: entry.start,
        end_time: entry.end,
        original_text: entry.text,
        translated_text: translations[entry.id] ?? "",
      }));

      // บันทึกซับเป็นชุด ชุดละ 500 รายการ
      for (let i = 0; i < subtitleRows.length; i += 500) {
        const { error: subtitleError } = await supabase
          .from("subtitles")
          .insert(subtitleRows.slice(i, i + 500));

        if (subtitleError) throw subtitleError;
      }

      const episode: SavedEpisode = {
        id: episodeData.id,
        title: title.trim(),
        fileName,
        entries,
        translations,
        savedAt: new Date().toISOString(),
      };

      updateActiveProject({
        episodes: [...savedEpisodes, episode],
      });

      setBackupMessage(`บันทึกตอน "${episode.title}" เรียบร้อยแล้ว`);
    } catch (err) {
      const dbError = err as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      };

      const errorMessage = [
        dbError?.message,
        dbError?.details,
        dbError?.hint,
        dbError?.code ? `รหัสข้อผิดพลาด: ${dbError.code}` : "",
      ].filter(Boolean).join("\\n") || (err instanceof Error ? err.message : "ไม่ทราบสาเหตุ");

      console.error("Save episode error:", err);

      // หากบันทึกซับไม่สำเร็จ ให้ลบตอนที่สร้างไว้เพื่อไม่ให้เหลือข้อมูลค้าง
      if (createdEpisodeId) {
        const supabase = createClient();
        const { error: cleanupError } = await supabase
          .from("episodes")
          .delete()
          .eq("id", createdEpisodeId);

        if (cleanupError) {
          console.error("Episode cleanup error:", cleanupError);
        }
      }

      setError(`บันทึกตอนไม่สำเร็จ: ${errorMessage}`);
    }
  }


  function loadEpisode(episode: SavedEpisode) {
    if (entries.length > 0 && !window.confirm("โหลดตอนนี้แทนงานที่เปิดอยู่หรือไม่? งานที่ยังไม่ได้บันทึกจะถูกแทนที่")) {
      return;
    }

    setEntries(episode.entries);
    setTranslations(episode.translations ?? {});
    setFileName(episode.fileName || `${episode.title}.srt`);
    setProgress(episode.entries.length
      ? Math.round((episode.entries.filter((entry) => episode.translations?.[entry.id]).length / episode.entries.length) * 100)
      : 0);
    setSuccess(false);
    setError("");
    setSearch("");
    setEditingId(null);
    setBackupMessage(`โหลดตอน "${episode.title}" แล้ว`);
  }

 
  async function deleteEpisode(episodeId: string) {
    const episode = savedEpisodes.find((item) => item.id === episodeId);

    if (!episode || !window.confirm(`ลบตอน "${episode.title}" หรือไม่?`)) {
      return;
    }

    try {
      setError("");

      const supabase = createClient();

      const { error } = await supabase
        .from("episodes")
        .delete()
        .eq("id", episodeId);

      if (error) throw error;

      updateActiveProject({
        episodes: savedEpisodes.filter((item) => item.id !== episodeId),
      });

      setBackupMessage(`ลบตอน "${episode.title}" เรียบร้อยแล้ว`);
    } catch (err) {
      console.error("Delete episode error:", err);
      setError("ลบตอนไม่สำเร็จ");
    }
  }


  function reset() {



    setEntries([]);



    setTranslations({});



    setFileName("");



    setProgress(0);



    setError("");



    setSuccess(false);



    setSearch("");



    setEditingId(null);



    if (inputRef.current) inputRef.current.value = "";



  }







  
  async function saveCharacter() {
    if (!characterForm?.name.trim()) return;

    const animeId = animeIds[projectName];
    if (!animeId) {
      setError("ไม่พบโปรเจกต์ในฐานข้อมูล");
      return;
    }

    try {
      setError("");
      const supabase = createClient();

      const { error } = await supabase
        .from("characters")
        .upsert({
          id: characterForm.id,
          anime_id: animeId,
          name: characterForm.name.trim(),
          description: characterForm.description,
          pronoun: characterForm.pronoun,
          speech_style: characterForm.speakingStyle,
          relationships: characterForm.relationships,
        }, { onConflict: "id" });

      if (error) throw error;

      const exists = activeProject.characters.some(
        (item) => item.id === characterForm.id
      );

      const characters = exists
        ? activeProject.characters.map((item) =>
            item.id === characterForm.id ? characterForm : item
          )
        : [...activeProject.characters, characterForm];

      updateActiveProject({ characters });
      setCharacterForm(null);
      setBackupMessage("บันทึกข้อมูลตัวละครเรียบร้อยแล้ว");
    } catch (err) {
      const dbError = err as { message?: string };
      setError(dbError?.message || (err instanceof Error ? err.message : "บันทึกตัวละครไม่สำเร็จ"));
      console.error("Save character error:", err);
    }
  }

  async function deleteCharacter(characterId: string) {
    if (!window.confirm("ต้องการลบตัวละครนี้หรือไม่?")) return;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("characters")
        .delete()
        .eq("id", characterId);

      if (error) throw error;

      updateActiveProject({
        characters: activeProject.characters.filter(
          (item) => item.id !== characterId
        ),
      });
      setBackupMessage("ลบตัวละครเรียบร้อยแล้ว");
    } catch (err) {
      const dbError = err as { message?: string };
      setError(dbError?.message || "ลบตัวละครไม่สำเร็จ");
      console.error("Delete character error:", err);
    }
  }

  async function saveGlossary() {
    if (!glossaryForm?.original.trim() || !glossaryForm.translation.trim()) {
      return;
    }

    const animeId = animeIds[projectName];
    if (!animeId) {
      setError("ไม่พบโปรเจกต์ในฐานข้อมูล");
      return;
    }

    try {
      setError("");
      const supabase = createClient();

      const { error } = await supabase
        .from("glossary")
        .upsert({
          id: glossaryForm.id,
          anime_id: animeId,
          source_term: glossaryForm.original.trim(),
          translated_term: glossaryForm.translation.trim(),
          note: glossaryForm.note,
        }, { onConflict: "id" });

      if (error) throw error;

      const exists = activeProject.glossary.some(
        (item) => item.id === glossaryForm.id
      );

      const glossary = exists
        ? activeProject.glossary.map((item) =>
            item.id === glossaryForm.id ? glossaryForm : item
          )
        : [...activeProject.glossary, glossaryForm];

      updateActiveProject({ glossary });
      setGlossaryForm(null);
      setBackupMessage("บันทึกคำศัพท์เรียบร้อยแล้ว");
    } catch (err) {
      const dbError = err as { message?: string };
      setError(dbError?.message || (err instanceof Error ? err.message : "บันทึกคำศัพท์ไม่สำเร็จ"));
      console.error("Save glossary error:", err);
    }
  }

  async function deleteGlossaryItem(itemId: string) {
    if (!window.confirm("ต้องการลบคำศัพท์นี้หรือไม่?")) return;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("glossary")
        .delete()
        .eq("id", itemId);

      if (error) throw error;

      updateActiveProject({
        glossary: activeProject.glossary.filter(
          (item) => item.id !== itemId
        ),
      });
      setBackupMessage("ลบคำศัพท์เรียบร้อยแล้ว");
    } catch (err) {
      const dbError = err as { message?: string };
      setError(dbError?.message || "ลบคำศัพท์ไม่สำเร็จ");
      console.error("Delete glossary error:", err);
    }
  }


  const inputClass = "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-violet-500";



  const buttonClass = "rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/10";







  return (



    <main className="studio-page min-h-screen w-full overflow-x-hidden px-3 py-5 text-white sm:px-6 sm:py-7 lg:px-10 lg:py-10">



      <style>{`
        .studio-page {
          background:
            radial-gradient(ellipse at 12% 0%, rgba(124,58,237,.19), transparent 34rem),
            radial-gradient(ellipse at 92% 12%, rgba(79,70,229,.12), transparent 30rem),
            #080810;
        }
        .studio-page > div { max-width: 1580px; }
        .studio-page header { position: relative; padding: 1.4rem 1.5rem; border: 1px solid rgba(167,139,250,.16); border-radius: 1.5rem; background: linear-gradient(115deg, rgba(35,24,62,.82), rgba(17,17,29,.88) 58%, rgba(18,18,30,.72)); box-shadow: 0 18px 55px rgba(0,0,0,.22); overflow: hidden; }
        .studio-page header:after { content: ""; position:absolute; width:18rem; height:18rem; right:-5rem; top:-9rem; border-radius:999px; background:rgba(139,92,246,.12); filter:blur(12px); pointer-events:none; }
        .studio-page header h1 { letter-spacing:-.045em; }
        .studio-page section.rounded-2xl { border-color:rgba(167,139,250,.16); background:linear-gradient(145deg,rgba(22,21,37,.96),rgba(13,13,23,.98)); box-shadow:0 16px 45px rgba(0,0,0,.18); }
        .studio-page button { transition:background-color .18s ease,border-color .18s ease,transform .18s ease,box-shadow .18s ease; }
        .studio-page button:not(:disabled):hover { transform:translateY(-1px); }
        .studio-page input:not([type=range]):not([type=checkbox]):not([type=color]),
        .studio-page textarea,.studio-page select { transition:border-color .18s ease,box-shadow .18s ease; }
        .studio-page input:focus,.studio-page textarea:focus,.studio-page select:focus { box-shadow:0 0 0 3px rgba(139,92,246,.12); }
        .video-player-shell { border:1px solid rgba(167,139,250,.22); box-shadow:0 18px 55px rgba(0,0,0,.4); }
        .video-player-stage { min-height:220px; }
        .video-player-shell:fullscreen { width:100vw; height:100dvh; max-width:none; border:0; border-radius:0; background:#000; display:flex; align-items:center; justify-content:center; }
        .video-player-shell:fullscreen .video-player-stage { width:100%; height:100%; min-height:0; max-height:100dvh; aspect-ratio:auto; }
        .video-player-shell:fullscreen .video-player-element { width:100%; height:100%; max-height:none; object-fit:contain; }
        .video-player-shell:fullscreen .video-fullscreen-toggle { display:none; }
        .video-player-shell:fullscreen .video-player-stage { cursor:default; }
        @media (max-width: 640px) {
          .studio-page header { padding:1.15rem; border-radius:1.2rem; }
          .video-player-stage { min-height:190px; }
          .video-player-shell:fullscreen .video-player-stage { min-height:0; }
        }
      `}</style>
      <div className="mx-auto w-full max-w-screen-2xl">



        <header className="mb-6 sm:mb-8">



          <div className="relative z-10 mb-3 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1.5 text-violet-300">



            <Languages size={22} />



            <span className="text-sm font-semibold tracking-widest">AI ANIME TRANSLATOR</span>



          </div>



          <h1 className="relative z-10 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">Subtitle <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-indigo-300 bg-clip-text text-transparent">Studio</span></h1>



          <p className="relative z-10 mt-3 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">แปล แก้ไข และจัดการซับอนิเมะด้วย AI ในพื้นที่ทำงานเดียว พร้อมระบบจดจำคำศัพท์และตัวละคร</p>



        </header>







        {/* Anime project and translation memory */}



        <section className="mb-6 rounded-2xl border border-violet-500/20 bg-[#12121c] p-3 shadow-xl shadow-black/10 sm:p-5">



          <div className="flex flex-wrap items-center justify-between gap-3">



            <div>



              <div className="flex items-center gap-2 text-violet-300">



                <FolderOpen size={18} />



                <h2 className="font-semibold">Anime Project</h2>



              </div>



              <p className="mt-1 text-xs text-gray-500">ข้อมูลตัวละครและคำศัพท์แยกตามแต่ละเรื่อง</p>



            </div>



            <div className="flex flex-wrap gap-2">



              <button onClick={createProject} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium hover:bg-violet-500">



                <Plus size={15} /> สร้างโปรเจกต์



              </button>



              <button onClick={renameProject} className={buttonClass}>เปลี่ยนชื่อ</button>



              <button onClick={deleteProject} className={buttonClass}>ลบโปรเจกต์</button>



              <button onClick={exportBackup} className={buttonClass}>Export Backup</button>



              <button onClick={() => backupInputRef.current?.click()} className={buttonClass}>Import Backup</button>



              <input ref={backupInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => importBackup(event.target.files?.[0])} />



            </div>



          </div>







          <div className="mt-4 grid gap-3 md:grid-cols-2">



            <div>



              <label className="mb-1.5 block text-xs text-gray-400">เลือกอนิเมะ</label>



              <select value={projectName} onChange={(event) => { setProjectName(event.target.value); setCharacterForm(null); setGlossaryForm(null); }} className={inputClass}>



                {Object.keys(projects).map((name) => <option key={name} value={name}>{name}</option>)}



              </select>



            </div>



            <div>



              <label className="mb-1.5 block text-xs text-gray-400">บริบทของเรื่อง / หมายเหตุถึง AI</label>



              <input value={activeProject.context} onChange={(event) => updateActiveProject({ context: event.target.value })} placeholder="เช่น อนิเมะแนวกีฬา ตัวเอกเป็นนักพนันเบสบอล..." className={inputClass} />



            </div>



          </div>







          <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-medium">Episode Manager</h3>
                <p className="text-xs text-gray-500">บันทึกและเรียกคืนไฟล์ซับกับคำแปล แยกตามอนิเมะ</p>
              </div>
              <span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-xs text-violet-300">
                {savedEpisodes.length} ตอน
              </span>
            </div>
            {savedEpisodes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/10 p-4 text-center text-sm text-gray-500">
                ยังไม่มีตอนที่บันทึก เปิดไฟล์ SRT แล้วกด “บันทึกตอน”
              </p>
            ) : (
              <div className="space-y-2">
                {savedEpisodes.map((episode) => (
                  <div key={episode.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-violet-200">{episode.title}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {episode.entries.length} บรรทัด · {Object.keys(episode.translations ?? {}).length} คำแปล · {new Date(episode.savedAt).toLocaleString("th-TH")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => loadEpisode(episode)} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium hover:bg-violet-500">
                        โหลดตอน
                      </button>
                      <button onClick={() => deleteEpisode(episode.id)} className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10">
                        ลบ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-b border-white/10 pb-3">



            <button onClick={() => { setActiveTab("characters"); setCharacterForm(null); }} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${activeTab === "characters" ? "bg-violet-600 text-white" : "text-gray-400 hover:bg-white/5"}`}>



              <Users size={16} /> ตัวละคร ({activeProject.characters.length})



            </button>



            <button onClick={() => { setActiveTab("glossary"); setGlossaryForm(null); }} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${activeTab === "glossary" ? "bg-violet-600 text-white" : "text-gray-400 hover:bg-white/5"}`}>



              <BookOpen size={16} /> คลังคำศัพท์ ({activeProject.glossary.length})



            </button>



          </div>







          {activeTab === "characters" && (



            <div className="pt-4">



              <div className="mb-3 flex items-center justify-between gap-2">



                <div>



                  <h3 className="font-medium">Character Memory</h3>



                  <p className="text-xs text-gray-500">กำหนดชื่อ สรรพนาม และลักษณะการพูด</p>



                </div>



                <button onClick={() => setCharacterForm({ id: crypto.randomUUID(), name: "", description: "", pronoun: "", speakingStyle: "", relationships: "" })} className="flex items-center gap-1.5 rounded-lg border border-violet-500/40 px-3 py-2 text-sm text-violet-300 hover:bg-violet-500/10">



                  <Plus size={15} /> เพิ่มตัวละคร



                </button>



              </div>







              {characterForm && (



                <div className="mb-4 grid gap-3 rounded-xl border border-violet-500/30 bg-black/20 p-4 md:grid-cols-2">



                  <div><label className="mb-1 block text-xs text-gray-400">ชื่อตัวละคร *</label><input className={inputClass} value={characterForm.name} onChange={(e) => setCharacterForm({ ...characterForm, name: e.target.value })} placeholder="เช่น 渡久地 東亜 / โทคุจิ โทอา" /></div>



                  <div><label className="mb-1 block text-xs text-gray-400">สรรพนามแทนตัว</label><input className={inputClass} value={characterForm.pronoun} onChange={(e) => setCharacterForm({ ...characterForm, pronoun: e.target.value })} placeholder="เช่น ฉัน, ผม, ข้า" /></div>



                  <div><label className="mb-1 block text-xs text-gray-400">บุคลิก / ลักษณะการพูด</label><input className={inputClass} value={characterForm.speakingStyle} onChange={(e) => setCharacterForm({ ...characterForm, speakingStyle: e.target.value })} placeholder="เช่น สุขุม พูดน้อย ชอบยั่วคู่สนทนา" /></div>



                  <div><label className="mb-1 block text-xs text-gray-400">ความสัมพันธ์ / วิธีเรียกคนอื่น</label><input className={inputClass} value={characterForm.relationships} onChange={(e) => setCharacterForm({ ...characterForm, relationships: e.target.value })} placeholder="เช่น เรียกคู่แข่งว่า นาย" /></div>



                  <div className="md:col-span-2"><label className="mb-1 block text-xs text-gray-400">ข้อมูลเพิ่มเติม</label><textarea className={inputClass} rows={2} value={characterForm.description} onChange={(e) => setCharacterForm({ ...characterForm, description: e.target.value })} placeholder="รายละเอียดที่ช่วยให้ AI เข้าใจตัวละคร" /></div>



                  <div className="flex gap-2 md:col-span-2"><button onClick={saveCharacter} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500">บันทึกตัวละคร</button><button onClick={() => setCharacterForm(null)} className={buttonClass}>ยกเลิก</button></div>



                </div>



              )}







              {activeProject.characters.length === 0 && !characterForm ? (



                <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-gray-500">ยังไม่มีตัวละคร กด “เพิ่มตัวละคร” เพื่อเริ่มสร้างฐานข้อมูล</p>



              ) : (



                <div className="grid gap-2 md:grid-cols-2">



                  {activeProject.characters.map((character) => (



                    <article key={character.id} className="rounded-xl border border-white/10 bg-black/20 p-3">



                      <div className="flex items-start justify-between gap-2">



                        <div className="min-w-0">



                          <h4 className="font-medium text-violet-200">{character.name}</h4>



                          <p className="mt-1 text-xs text-gray-400">{character.pronoun && `แทนตัว: ${character.pronoun}`}{character.speakingStyle && ` · ${character.speakingStyle}`}</p>



                          {character.relationships && <p className="mt-1 text-xs text-gray-500">{character.relationships}</p>}



                          {character.description && <p className="mt-1 text-xs text-gray-500">{character.description}</p>}



                        </div>



                        <div className="flex shrink-0 gap-1">



                          <button title="แก้ไข" onClick={() => setCharacterForm({ ...character })} className="rounded p-2 text-gray-400 hover:bg-white/10 hover:text-white"><Pencil size={15} /></button>



                          <button title="ลบ" onClick={() => deleteCharacter(character.id)} className="rounded p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-400"><Trash2 size={15} /></button>



                        </div>



                      </div>



                    </article>



                  ))}



                </div>



              )}



            </div>



          )}







          {activeTab === "glossary" && (



            <div className="pt-4">



              <div className="mb-3 flex items-center justify-between gap-2">



                <div>



                  <h3 className="font-medium">Translation Glossary</h3>



                  <p className="text-xs text-gray-500">ล็อกคำแปลชื่อ ท่าไม้ตาย องค์กร และคำเฉพาะ</p>



                </div>



                <button onClick={() => setGlossaryForm({ id: crypto.randomUUID(), original: "", translation: "", note: "" })} className="flex items-center gap-1.5 rounded-lg border border-violet-500/40 px-3 py-2 text-sm text-violet-300 hover:bg-violet-500/10">



                  <Plus size={15} /> เพิ่มคำศัพท์



                </button>



              </div>







              {glossaryForm && (



                <div className="mb-4 grid gap-3 rounded-xl border border-violet-500/30 bg-black/20 p-4 md:grid-cols-2">



                  <div><label className="mb-1 block text-xs text-gray-400">คำต้นฉบับ *</label><input className={inputClass} value={glossaryForm.original} onChange={(e) => setGlossaryForm({ ...glossaryForm, original: e.target.value })} placeholder="เช่น 渡久地" /></div>



                  <div><label className="mb-1 block text-xs text-gray-400">คำแปลที่ต้องการ *</label><input className={inputClass} value={glossaryForm.translation} onChange={(e) => setGlossaryForm({ ...glossaryForm, translation: e.target.value })} placeholder="เช่น โทคุจิ" /></div>



                  <div className="md:col-span-2"><label className="mb-1 block text-xs text-gray-400">หมายเหตุ</label><input className={inputClass} value={glossaryForm.note} onChange={(e) => setGlossaryForm({ ...glossaryForm, note: e.target.value })} placeholder="เช่น ชื่อตัวละครหลัก ห้ามเปลี่ยนรูปสะกด" /></div>



                  <div className="flex gap-2 md:col-span-2"><button onClick={saveGlossary} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500">บันทึกคำศัพท์</button><button onClick={() => setGlossaryForm(null)} className={buttonClass}>ยกเลิก</button></div>



                </div>



              )}







              {activeProject.glossary.length === 0 && !glossaryForm ? (



                <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-gray-500">ยังไม่มีคำศัพท์ กด “เพิ่มคำศัพท์” เพื่อกำหนดคำแปล</p>



              ) : (



                <div className="space-y-2">



                  {activeProject.glossary.map((item) => (



                    <article key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">



                      <div className="min-w-0">



                        <p className="break-words text-sm text-gray-300">{item.original} <span className="px-2 text-violet-400">→</span> <strong className="text-green-300">{item.translation}</strong></p>



                        {item.note && <p className="mt-1 text-xs text-gray-500">{item.note}</p>}



                      </div>



                      <div className="flex shrink-0 gap-1">



                        <button title="แก้ไข" onClick={() => setGlossaryForm({ ...item })} className="rounded p-2 text-gray-400 hover:bg-white/10 hover:text-white"><Pencil size={15} /></button>



                        <button title="ลบ" onClick={() => deleteGlossaryItem(item.id)} className="rounded p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-400"><Trash2 size={15} /></button>



                      </div>



                    </article>



                  ))}



                </div>



              )}



            </div>



          )}







          <p className="mt-4 flex items-center gap-2 text-xs text-gray-500">



            <Save size={13} /> บันทึกข้อมูลอัตโนมัติในเบราว์เซอร์เครื่องนี้



          </p>



          {backupMessage && <p className="mt-2 text-xs text-violet-300">{backupMessage}</p>}



        </section>







        {!fileName && (



          <div



            onDragOver={(event) => event.preventDefault()}



            onDrop={(event) => { event.preventDefault(); handleFile(event.dataTransfer.files[0]); }}



            onClick={() => inputRef.current?.click()}



            className="cursor-pointer rounded-2xl border border-dashed border-violet-500/40 bg-[#12121c] p-12 text-center transition hover:border-violet-400 hover:bg-[#171526]"



          >



            <input ref={inputRef} type="file" accept=".srt" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} />



            <Upload className="mx-auto mb-4 text-violet-400" size={40} />



            <h2 className="text-lg font-semibold">เลือกไฟล์ SRT หรือลากไฟล์มาวาง</h2>



            <p className="mt-2 text-sm text-gray-500">รองรับไฟล์ .srt</p>



          </div>



        )}







        {fileName && (



          <>



            <section className="mb-6 rounded-2xl border border-white/10 bg-[#12121c] p-3 shadow-xl shadow-black/10 sm:p-5">



              <div className="flex flex-wrap items-center justify-between gap-4">



                <div className="flex items-center gap-3">



                  <FileText className="text-violet-400" size={30} />



                  <div><p className="font-semibold">{fileName}</p><p className="text-sm text-gray-500">{entries.length.toLocaleString()} บรรทัด</p></div>



                </div>



                <button onClick={reset} disabled={loading} className="rounded-lg p-2 text-gray-400 hover:bg-white/10 disabled:opacity-40" title="ปิดไฟล์"><X size={20} /></button>



              </div>



              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">



                <div className="rounded-xl bg-white/5 p-3"><p className="text-xs text-gray-500">ทั้งหมด</p><p className="mt-1 text-xl font-bold">{entries.length}</p></div>



                <div className="rounded-xl bg-white/5 p-3"><p className="text-xs text-gray-500">แปลแล้ว</p><p className="mt-1 text-xl font-bold text-green-400">{translatedCount}</p></div>



                <div className="col-span-2 rounded-xl bg-white/5 p-3 md:col-span-1"><p className="text-xs text-gray-500">ความคืบหน้า</p><p className="mt-1 text-xl font-bold text-violet-400">{progress}%</p></div>



              </div>



              <section className="mt-5 rounded-xl border border-white/10 bg-black/20 p-3 sm:p-4">

                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">

                  <div className="flex items-center gap-2">

                    <Film size={18} className="text-violet-400" />

                    <div>

                      <h3 className="text-sm font-semibold">Video Player</h3>

                      <p className="text-xs text-gray-500">เปิดวิดีโอจากเครื่องเพื่อดูภาพพร้อมซับตามเวลา</p>

                    </div>

                  </div>

                  <div className="flex flex-wrap gap-2">

                    <input

                      ref={videoInputRef}

                      type="file"

                      accept="video/*,.mkv,.m4v,.mov,.ogv"

                      className="hidden"

                      onChange={(event) => handleVideoFile(event.target.files?.[0])}

                    />

                    <button

                      onClick={() => videoInputRef.current?.click()}

                      className="flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium hover:bg-violet-500"

                    >

                      <Video size={15} /> {videoFile ? "เปลี่ยนวิดีโอ" : "เลือกวิดีโอ"}

                    </button>

                    {videoFile && (

                      <button

                        onClick={() => { setVideoFile(null); setVideoTime(0); if (videoInputRef.current) videoInputRef.current.value = ""; }}

                        className="rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 hover:bg-white/10"

                      >

                        เอาวิดีโอออก

                      </button>

                    )}


                  </div>

                </div>



                {videoUrl ? (

                  <>

                    <div
                      ref={videoContainerRef}
                      className="video-player-shell relative w-full overflow-hidden rounded-lg bg-black"
                    >
                      <div
                        ref={videoStageRef}
                        className="video-player-stage relative flex aspect-video w-full items-center justify-center bg-black"
                      >
                        <video
                          ref={videoRef}
                          src={videoUrl}
                          controls
                          controlsList="nofullscreen"
                          playsInline
                          className="video-player-element block h-full max-h-[min(76vh,900px)] w-full object-contain"
                          onLoadedMetadata={() => {
                            const video = videoRef.current;
                            if (video) setVideoTime(video.currentTime);
                          }}
                          onTimeUpdate={(event) => setVideoTime(event.currentTarget.currentTime)}
                          onRateChange={(event) => setPlaybackRate(event.currentTarget.playbackRate)}
                        />

                        <button
                          type="button"
                          onClick={toggleVideoFullscreen}
                          aria-label="เปิดโหมดเต็มจอ"
                          title="ขยายวิดีโอเต็มหน้าจอ"
                          className="video-fullscreen-toggle absolute right-3 top-3 z-40 rounded-lg border border-white/15 bg-black/65 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur transition hover:bg-violet-700/80 sm:text-sm"
                        >
                          เต็มจอ
                        </button>

                        {videoContentRect.width > 0 && videoContentRect.height > 0 && subtitleSettings.maskEnabled && (
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute z-10"
                            style={{
                              left: videoContentRect.left + videoContentRect.width * (1 - subtitleSettings.maskWidth / 100) / 2,
                              top: videoContentRect.top + videoContentRect.height * (1 - subtitleSettings.maskBottom / 100 - subtitleSettings.maskHeight / 100),
                              width: videoContentRect.width * subtitleSettings.maskWidth / 100,
                              height: videoContentRect.height * subtitleSettings.maskHeight / 100,
                              backgroundColor: subtitleSettings.maskColor,
                              opacity: subtitleSettings.maskOpacity,
                              borderRadius: `${subtitleSettings.maskRadius}px`,
                            }}
                          />
                        )}

                        {activeSubtitle && subtitleSettings.thaiEnabled && videoContentRect.width > 0 && (
                          <div
                            className="pointer-events-none absolute z-20 flex justify-center px-2 text-center"
                            style={{
                              left: videoContentRect.left,
                              width: videoContentRect.width,
                              bottom: `calc(100% - ${videoContentRect.top + videoContentRect.height}px + ${videoContentRect.height * subtitleSettings.thaiBottom / 100}px)`,
                            }}
                          >
                            <span
                              className="max-w-full whitespace-pre-wrap rounded-md px-3 py-1.5 font-semibold leading-relaxed"
                              style={{
                                fontFamily: subtitleSettings.thaiFontFamily,
                                fontSize: `${subtitleSettings.thaiFontSize}px`,
                                color: subtitleSettings.thaiColor,
                                WebkitTextStroke: `${subtitleSettings.thaiStrokeWidth}px ${subtitleSettings.thaiStrokeColor}`,
                                paintOrder: "stroke fill",
                                textShadow: subtitleSettings.thaiShadow ? "0 2px 4px rgba(0,0,0,0.95)" : "none",
                              }}
                            >
                              {translations[activeSubtitle.id] || activeSubtitle.text}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">

                      <span className="max-w-full truncate">{videoFile?.name}</span>

                      <span className="text-gray-600">•</span>

                      <button onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5); }} className="rounded border border-white/10 px-2 py-1 hover:bg-white/10">−5 วินาที</button>

                      <button onClick={() => { if (videoRef.current) videoRef.current.currentTime += 5; }} className="rounded border border-white/10 px-2 py-1 hover:bg-white/10">+5 วินาที</button>

                      <label className="ml-auto flex items-center gap-2">

                        ความเร็ว

                        <select

                          value={playbackRate}

                          onChange={(event) => { const rate = Number(event.target.value); setPlaybackRate(rate); if (videoRef.current) videoRef.current.playbackRate = rate; }}

                          className="rounded border border-white/10 bg-[#12121c] px-2 py-1 text-white"

                        >

                          {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => <option key={rate} value={rate}>{rate}x</option>)}

                        </select>

                      </label>

                    </div>

                    <p className="mt-2 text-xs text-amber-300/80">หมายเหตุ: MP4 และ WebM รองรับได้ดีที่สุด ส่วน MKV อาจเล่นไม่ได้ขึ้นอยู่กับ Codec และเบราว์เซอร์</p>

                    <div className="mt-4 rounded-xl border border-violet-500/20 bg-[#11111b] p-4">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-semibold text-violet-200">Subtitle Display Settings</h4>
                          <p className="mt-1 text-xs text-gray-500">ปรับแถบบังซับอังกฤษและรูปแบบซับไทยบนภาพวิดีโอ</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSubtitleSettings(DEFAULT_VIDEO_SUBTITLE_SETTINGS)}
                          className="rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/10"
                        >
                          Reset ค่าเริ่มต้น
                        </button>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-3">
                          <label className="flex items-center justify-between gap-3 text-sm font-medium">
                            <span>ปิดบังซับอังกฤษ (English Mask)</span>
                            <input type="checkbox" checked={subtitleSettings.maskEnabled} onChange={(event) => updateSubtitleSettings({ maskEnabled: event.target.checked })} className="h-4 w-4 accent-violet-500" />
                          </label>
                          <label className="block text-xs text-gray-300">ความสูง: {subtitleSettings.maskHeight}%
                            <input type="range" min="3" max="25" step="1" value={subtitleSettings.maskHeight} onChange={(event) => updateSubtitleSettings({ maskHeight: Number(event.target.value) })} className="mt-2 w-full accent-violet-500" />
                          </label>
                          <label className="block text-xs text-gray-300">ตำแหน่งจากขอบล่าง: {subtitleSettings.maskBottom}%
                            <input type="range" min="0" max="30" step="1" value={subtitleSettings.maskBottom} onChange={(event) => updateSubtitleSettings({ maskBottom: Number(event.target.value) })} className="mt-2 w-full accent-violet-500" />
                          </label>
                          <label className="block text-xs text-gray-300">ความกว้าง: {subtitleSettings.maskWidth}%
                            <input type="range" min="40" max="100" step="1" value={subtitleSettings.maskWidth} onChange={(event) => updateSubtitleSettings({ maskWidth: Number(event.target.value) })} className="mt-2 w-full accent-violet-500" />
                          </label>
                          <div className="grid grid-cols-2 gap-3">
                            <label className="text-xs text-gray-300">สีพื้นหลัง
                              <input type="color" value={subtitleSettings.maskColor} onChange={(event) => updateSubtitleSettings({ maskColor: event.target.value })} className="mt-1 h-9 w-full cursor-pointer rounded border border-white/10 bg-transparent" />
                            </label>
                            <label className="text-xs text-gray-300">มุมโค้ง: {subtitleSettings.maskRadius}px
                              <input type="range" min="0" max="24" value={subtitleSettings.maskRadius} onChange={(event) => updateSubtitleSettings({ maskRadius: Number(event.target.value) })} className="mt-2 w-full accent-violet-500" />
                            </label>
                          </div>
                          <label className="block text-xs text-gray-300">ความทึบ: {Math.round(subtitleSettings.maskOpacity * 100)}%
                            <input type="range" min="0" max="1" step="0.05" value={subtitleSettings.maskOpacity} onChange={(event) => updateSubtitleSettings({ maskOpacity: Number(event.target.value) })} className="mt-2 w-full accent-violet-500" />
                          </label>
                        </div>

                        <div className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-3">
                          <label className="flex items-center justify-between gap-3 text-sm font-medium">
                            <span>แสดงซับไทย (Thai Subtitle)</span>
                            <input type="checkbox" checked={subtitleSettings.thaiEnabled} onChange={(event) => updateSubtitleSettings({ thaiEnabled: event.target.checked })} className="h-4 w-4 accent-violet-500" />
                          </label>
                          <label className="block text-xs text-gray-300">ขนาดตัวอักษร: {subtitleSettings.thaiFontSize}px
                            <input type="range" min="14" max="48" step="1" value={subtitleSettings.thaiFontSize} onChange={(event) => updateSubtitleSettings({ thaiFontSize: Number(event.target.value) })} className="mt-2 w-full accent-violet-500" />
                          </label>
                          <label className="block text-xs text-gray-300">ตำแหน่งจากขอบล่าง: {subtitleSettings.thaiBottom}%
                            <input type="range" min="0" max="25" step="1" value={subtitleSettings.thaiBottom} onChange={(event) => updateSubtitleSettings({ thaiBottom: Number(event.target.value) })} className="mt-2 w-full accent-violet-500" />
                          </label>
                          <label className="block text-xs text-gray-300">ฟอนต์
                            <select value={subtitleSettings.thaiFontFamily} onChange={(event) => updateSubtitleSettings({ thaiFontFamily: event.target.value })} className="mt-1 w-full rounded border border-white/10 bg-[#12121c] px-2 py-2 text-white">
                              <option value="sans-serif">Sans-serif</option>
                              <option value="Arial, sans-serif">Arial</option>
                              <option value="Tahoma, sans-serif">Tahoma</option>
                              <option value="serif">Serif</option>
                              <option value="monospace">Monospace</option>
                            </select>
                          </label>
                          <div className="grid grid-cols-2 gap-3">
                            <label className="text-xs text-gray-300">สีตัวอักษร
                              <input type="color" value={subtitleSettings.thaiColor} onChange={(event) => updateSubtitleSettings({ thaiColor: event.target.value })} className="mt-1 h-9 w-full cursor-pointer rounded border border-white/10 bg-transparent" />
                            </label>
                            <label className="text-xs text-gray-300">สีขอบ
                              <input type="color" value={subtitleSettings.thaiStrokeColor} onChange={(event) => updateSubtitleSettings({ thaiStrokeColor: event.target.value })} className="mt-1 h-9 w-full cursor-pointer rounded border border-white/10 bg-transparent" />
                            </label>
                          </div>
                          <label className="block text-xs text-gray-300">ความหนาขอบ: {subtitleSettings.thaiStrokeWidth}px
                            <input type="range" min="0" max="5" step="0.5" value={subtitleSettings.thaiStrokeWidth} onChange={(event) => updateSubtitleSettings({ thaiStrokeWidth: Number(event.target.value) })} className="mt-2 w-full accent-violet-500" />
                          </label>
                          <label className="flex items-center justify-between gap-3 text-xs text-gray-300">
                            <span>เปิดเงาตัวอักษร</span>
                            <input type="checkbox" checked={subtitleSettings.thaiShadow} onChange={(event) => updateSubtitleSettings({ thaiShadow: event.target.checked })} className="h-4 w-4 accent-violet-500" />
                          </label>
                        </div>
                      </div>
                    </div>

                  </>

                ) : (

                  <button

                    onClick={() => videoInputRef.current?.click()}

                    onDragOver={(event) => event.preventDefault()}

                    onDrop={(event) => { event.preventDefault(); handleVideoFile(event.dataTransfer.files[0]); }}

                    className="w-full rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-8 text-center transition hover:border-violet-400 hover:bg-violet-500/5"

                  >

                    <Upload className="mx-auto mb-2 text-violet-400" size={26} />

                    <span className="block text-sm font-medium">เลือกหรือลากไฟล์วิดีโอมาวาง</span>

                    <span className="mt-1 block text-xs text-gray-500">MP4, WebM, MOV, MKV · เล่นในเครื่อง ไม่อัปโหลดขึ้นเซิร์ฟเวอร์</span>

                  </button>

                )}

              </section>



              <div className="mt-5 flex flex-wrap gap-3">



                <button onClick={translateAll} disabled={loading} className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 font-semibold hover:bg-violet-500 disabled:opacity-50">



                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Languages size={18} />}



                  {loading ? "กำลังแปล..." : "เริ่มแปลทั้งหมด"}



                </button>



                <button onClick={downloadSRT} disabled={translatedCount === 0} className="flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 font-semibold hover:bg-white/10 disabled:opacity-40"><Download size={18} /> ดาวน์โหลด SRT</button>
                <button onClick={saveEpisode} disabled={entries.length === 0 || loading} className="flex items-center gap-2 rounded-xl border border-green-500/30 px-5 py-3 font-semibold text-green-300 hover:bg-green-500/10 disabled:opacity-40">
                  <Save size={18} /> บันทึกตอน
                </button>



              </div>



              {loading && <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${progress}%` }} /></div>}



              {success && <p className="mt-4 flex items-center gap-2 text-sm text-green-400"><CheckCircle2 size={18} /> แปลครบทุกบรรทัดแล้ว สามารถแก้ไขและดาวน์โหลดได้</p>}



              {error && <p className="mt-4 flex items-start gap-2 text-sm text-red-400"><AlertCircle size={18} className="shrink-0" /> {error}</p>}



            </section>







            <section className="overflow-hidden rounded-2xl border border-violet-300/10 bg-gradient-to-b from-[#171522] to-[#101018] shadow-[0_18px_50px_rgba(0,0,0,.22)]">
              <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300"><FileText size={19} /></div>
                  <div>
                    <h2 className="text-lg font-bold tracking-tight">Subtitle Editor</h2>
                    <p className="text-xs text-gray-500">{filteredEntries.length} รายการ · แปลแล้ว {translatedCount} รายการ</p>
                  </div>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาข้อความหรือคำแปล..." className="w-full rounded-xl border border-white/10 bg-black/25 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-violet-500" />
                </div>
              </div>

              {filteredEntries.length > 0 ? (
                <>
                  <div className={`space-y-2.5 p-3 sm:p-4 ${showAllSubtitles && !search.trim() ? "max-h-[70vh] overflow-y-auto" : ""}`}>
                    {visibleEntries.map((entry) => {
                      const translated = translations[entry.id] ?? "";
                      const isEditing = editingId === entry.id;
                      return (
                        <article key={entry.id} className="group rounded-xl border border-white/[0.07] bg-black/20 p-3 transition hover:border-violet-400/25 hover:bg-white/[0.025] sm:p-4">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="rounded-md bg-violet-500/15 px-2 py-1 text-[11px] font-semibold text-violet-300">#{entry.id}</span>
                              <span className="text-[11px] tabular-nums text-gray-500">{entry.start} → {entry.end}</span>
                            </div>
                            {translated && <button onClick={() => setEditingId(isEditing ? null : entry.id)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-violet-300 transition hover:bg-violet-500/10"> <Pencil size={13} />{isEditing ? "เสร็จ" : "แก้ไข"}</button>}
                          </div>
                          <div className="grid gap-3 md:grid-cols-2 md:gap-4">
                            <div className="min-w-0">
                              <p className="mb-1.5 text-[10px] font-bold tracking-[.14em] text-gray-500">ORIGINAL</p>
                              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-300">{entry.text}</p>
                            </div>
                            <div className="min-w-0 border-t border-white/[0.06] pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
                              <p className="mb-1.5 text-[10px] font-bold tracking-[.14em] text-violet-300">THAI TRANSLATION</p>
                              {isEditing ? <textarea autoFocus value={translated} onChange={(event) => updateTranslation(entry.id, event.target.value)} rows={3} className="w-full rounded-xl border border-violet-500/40 bg-black/30 p-3 text-sm leading-6 text-white outline-none focus:border-violet-400" placeholder="พิมพ์คำแปลภาษาไทย..." /> : <p className={`whitespace-pre-wrap break-words text-sm leading-6 ${translated ? "text-green-300" : "text-gray-600"}`}>{translated || "ยังไม่ได้แปล"}</p>}
                              {translated && !isEditing && <button onClick={() => setEditingId(entry.id)} className="mt-2 flex items-center gap-1 text-[11px] text-gray-500 transition hover:text-white"><Pencil size={11} /> แก้คำแปล</button>}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {!search.trim() && filteredEntries.length > 6 && (
                    <div className="border-t border-white/[0.07] px-4 py-3 text-center">
                      <button onClick={() => setShowAllSubtitles((value) => !value)} className="rounded-lg border border-violet-400/20 bg-violet-500/10 px-4 py-2 text-xs font-medium text-violet-200 transition hover:bg-violet-500/20">
                        {showAllSubtitles ? "ย่อรายการ" : `แสดงซับทั้งหมด (${filteredEntries.length} รายการ)`}
                      </button>
                      {!showAllSubtitles && <p className="mt-1.5 text-[10px] text-gray-600">แสดง 6 รายการแรก เพื่อลดความยาวของหน้า</p>}
                    </div>
                  )}
                </>
              ) : (
                <div className="p-8 text-center text-sm text-gray-500">{entries.length ? "ไม่พบข้อความที่ค้นหา" : "ยังไม่มีซับไตเติลให้แก้ไข — เพิ่มไฟล์ SRT แล้วเริ่มแปลได้เลย"}</div>
              )}
            </section>



          </>



        )}







        <footer className="mt-12 border-t border-white/10 py-6 text-center text-xs text-gray-600">AI ANIME SUBTITLE TRANSLATOR</footer>



      </div>



    </main>



  );



}

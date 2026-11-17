"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  parseSRT,
  buildSRT,
  type SubtitleEntry,
} from "@/lib/srt";
import {
  Upload, Languages, Download, FileText, Loader2, CheckCircle2,
  AlertCircle, X, Search, Pencil, Plus, Trash2, Users, BookOpen,
  FolderOpen, Save,
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

type Episode = {
  id: string;
  title: string;
  fileName: string;
  entries: SubtitleEntry[];
  translations: Record<number, string>;
  updatedAt: string;
};

type ProjectData = {
  context: string;
  characters: Character[];
  glossary: GlossaryItem[];
  episodes: Episode[];
};

const EMPTY_PROJECT: ProjectData = {
  context: "",
  characters: [],
  glossary: [],
  episodes: [],
};

const STORAGE_KEY = "anime-subtitle-translator-projects-v1";

export default function SubtitleTranslator() {
  const inputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<SubtitleEntry[]>([]);
  const [fileName, setFileName] = useState("");
  const [translations, setTranslations] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const [projectName, setProjectName] = useState("โปรเจกต์ใหม่");
  const [projects, setProjects] = useState<Record<string, ProjectData>>({
    "โปรเจกต์ใหม่": EMPTY_PROJECT,
  });
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<"characters" | "glossary">("characters");
  const [backupMessage, setBackupMessage] = useState("");
  const [currentEpisodeId, setCurrentEpisodeId] = useState<string | null>(null);

  const [characterForm, setCharacterForm] = useState<Character | null>(null);
  const [glossaryForm, setGlossaryForm] = useState<GlossaryItem | null>(null);

  const activeProject = projects[projectName] ?? EMPTY_PROJECT;
  const translatedCount = Object.keys(translations).length;

  // Load saved anime projects once when the app opens.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          currentProject?: string;
          projects?: Record<string, ProjectData>;
        };
        if (parsed.projects && Object.keys(parsed.projects).length > 0) {
          // Add the episodes field when loading projects created by older versions.
          const normalizedProjects = Object.fromEntries(
            Object.entries(parsed.projects).map(([name, project]) => [
              name,
              { ...project, episodes: Array.isArray(project.episodes) ? project.episodes : [] },
            ])
          ) as Record<string, ProjectData>;
          setProjects(normalizedProjects);
          const selected =
            parsed.currentProject && normalizedProjects[parsed.currentProject]
              ? parsed.currentProject
              : Object.keys(normalizedProjects)[0];
          setProjectName(selected);
        }
      }
    } catch (err) {
      console.error("Could not load saved projects:", err);
    } finally {
      setHydrated(true);
    }
  }, []);

  // Persist all projects locally. No account or cloud storage is used.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ currentProject: projectName, projects })
      );
    } catch (err) {
      console.error("Could not save projects:", err);
    }
  }, [projects, projectName, hydrated]);

  function updateActiveProject(patch: Partial<ProjectData>) {
    setProjects((previous) => ({
      ...previous,
      [projectName]: {
        ...EMPTY_PROJECT,
        ...(previous[projectName] ?? {}),
        ...patch,
      },
    }));
  }

  function createProject() {
    const name = window.prompt("ตั้งชื่อโปรเจกต์อนิเมะ");
    if (!name?.trim()) return;
    const cleanName = name.trim();
    if (projects[cleanName]) {
      setProjectName(cleanName);
      return;
    }
    setProjects((previous) => ({ ...previous, [cleanName]: { ...EMPTY_PROJECT } }));
    setProjectName(cleanName);
    reset();
    setCharacterForm(null);
    setGlossaryForm(null);
  }

  function renameProject() {
    const name = window.prompt("เปลี่ยนชื่อโปรเจกต์", projectName);
    if (!name?.trim() || name.trim() === projectName) return;
    const cleanName = name.trim();
    if (projects[cleanName]) {
      setError("มีโปรเจกต์ชื่อนี้อยู่แล้ว");
      return;
    }
    setProjects((previous) => {
      const next = { ...previous };
      next[cleanName] = next[projectName] ?? { ...EMPTY_PROJECT };
      delete next[projectName];
      return next;
    });
    setProjectName(cleanName);
  }

  function deleteProject() {
    if (Object.keys(projects).length <= 1) {
      setError("ต้องเหลืออย่างน้อยหนึ่งโปรเจกต์");
      return;
    }
    if (!window.confirm(`ลบโปรเจกต์ "${projectName}" และข้อมูลตัวละคร/คำศัพท์ทั้งหมดหรือไม่?`)) return;
    const next = { ...projects };
    delete next[projectName];
    const nextName = Object.keys(next)[0];
    setProjects(next);
    setProjectName(nextName);
    setCurrentEpisodeId(null);
    reset();
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
          next[name] = { ...EMPTY_PROJECT, ...project, episodes: Array.isArray(project.episodes) ? project.episodes : [] };
        }
        return next;
      });
      setProjectName(added[0][0]);
      setCurrentEpisodeId(null);
      reset();
      setCharacterForm(null);
      setGlossaryForm(null);
      setBackupMessage(`นำเข้า ${added.length} โปรเจกต์สำเร็จ · ข้าม ${validProjects.length - added.length} โปรเจกต์ที่มีชื่อซ้ำ`);
    } catch (err) {
      setBackupMessage(err instanceof Error ? err.message : "ไม่สามารถนำเข้าไฟล์สำรองได้");
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  }

  function saveEpisode() {
    if (entries.length === 0) {
      setError("ให้อัปโหลดไฟล์ SRT ก่อนบันทึกตอน");
      return;
    }

    const existing = (activeProject.episodes ?? []).find((episode) => episode.id === currentEpisodeId);
    const title = existing?.title || window.prompt("ตั้งชื่อตอน เช่น Episode 01", fileName.replace(/\.srt$/i, ""));
    if (!title?.trim()) return;

    const episode: Episode = {
      id: existing?.id ?? crypto.randomUUID(),
      title: title.trim(),
      fileName,
      entries: [...entries],
      translations: { ...translations },
      updatedAt: new Date().toISOString(),
    };

    const episodes = existing
      ? (activeProject.episodes ?? []).map((item) => item.id === existing.id ? episode : item)
      : [...(activeProject.episodes ?? []), episode];

    updateActiveProject({ episodes });
    setCurrentEpisodeId(episode.id);
    setBackupMessage(`บันทึก ${episode.title} เรียบร้อยแล้ว`);
    setError("");
  }

  function openEpisode(episodeId: string) {
    const episode = (activeProject.episodes ?? []).find((item) => item.id === episodeId);
    if (!episode) return;
    if (entries.length > 0 && !window.confirm("เปิดตอนที่บันทึกไว้? ข้อมูลซับที่กำลังเปิดอยู่จะถูกแทนที่ แต่ไม่ได้ลบออกจากโปรเจกต์")) return;
    setEntries(episode.entries);
    setTranslations(episode.translations ?? {});
    setFileName(episode.fileName || `${episode.title}.srt`);
    setCurrentEpisodeId(episode.id);
    setProgress(episode.entries.length > 0
      ? Math.round((Object.keys(episode.translations ?? {}).length / episode.entries.length) * 100)
      : 0);
    setSuccess(episode.entries.length > 0 && Object.keys(episode.translations ?? {}).length === episode.entries.length);
    setSearch("");
    setEditingId(null);
    setError("");
  }

  function deleteEpisode() {
    if (!currentEpisodeId) return;
    const episode = (activeProject.episodes ?? []).find((item) => item.id === currentEpisodeId);
    if (!episode || !window.confirm(`ลบ ${episode.title} ออกจากโปรเจกต์นี้หรือไม่?`)) return;
    updateActiveProject({ episodes: (activeProject.episodes ?? []).filter((item) => item.id !== currentEpisodeId) });
    setCurrentEpisodeId(null);
    reset();
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
      setCurrentEpisodeId(null);
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

  function reset() {
    setEntries([]);
    setTranslations({});
    setFileName("");
    setProgress(0);
    setError("");
    setSuccess(false);
    setSearch("");
    setEditingId(null);
    setCurrentEpisodeId(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function saveCharacter() {
    if (!characterForm?.name.trim()) return;
    const exists = activeProject.characters.some((item) => item.id === characterForm.id);
    const characters = exists
      ? activeProject.characters.map((item) => item.id === characterForm.id ? characterForm : item)
      : [...activeProject.characters, characterForm];
    updateActiveProject({ characters });
    setCharacterForm(null);
  }

  function saveGlossary() {
    if (!glossaryForm?.original.trim() || !glossaryForm.translation.trim()) return;
    const exists = activeProject.glossary.some((item) => item.id === glossaryForm.id);
    const glossary = exists
      ? activeProject.glossary.map((item) => item.id === glossaryForm.id ? glossaryForm : item)
      : [...activeProject.glossary, glossaryForm];
    updateActiveProject({ glossary });
    setGlossaryForm(null);
  }

  const inputClass = "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-violet-500";
  const buttonClass = "rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/10";

  return (
    <main className="min-h-screen bg-[#09090f] p-4 text-white md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7">
          <div className="mb-3 flex items-center gap-2 text-violet-400">
            <Languages size={22} />
            <span className="text-sm font-semibold tracking-widest">AI ANIME TRANSLATOR</span>
          </div>
          <h1 className="text-3xl font-bold">Subtitle Studio</h1>
          <p className="mt-2 text-sm text-gray-400">แปล แก้ไข และจัดการซับอนิเมะด้วย AI</p>
        </header>

        {/* Anime project and translation memory */}
        <section className="mb-6 rounded-2xl border border-violet-500/20 bg-[#12121c] p-5">
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
              <select value={projectName} onChange={(event) => { setProjectName(event.target.value); reset(); setCharacterForm(null); setGlossaryForm(null); }} className={inputClass}>
                {Object.keys(projects).map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-gray-400">บริบทของเรื่อง / หมายเหตุถึง AI</label>
              <input value={activeProject.context} onChange={(event) => updateActiveProject({ context: event.target.value })} placeholder="เช่น อนิเมะแนวกีฬา ตัวเอกเป็นนักพนันเบสบอล..." className={inputClass} />
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-2 font-medium"><FileText size={16} className="text-violet-300" /> Episode Manager</h3>
                <p className="mt-1 text-xs text-gray-500">เก็บซับและคำแปลแยกเป็นตอน โดยใช้ตัวละครและคลังคำศัพท์ร่วมกันทั้งเรื่อง</p>
              </div>
              <span className="text-xs text-gray-500">{(activeProject.episodes ?? []).length} ตอน</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={currentEpisodeId ?? ""}
                onChange={(event) => event.target.value && openEpisode(event.target.value)}
                className={`${inputClass} min-w-0 flex-1`}
              >
                <option value="">เลือกตอนที่บันทึกไว้...</option>
                {(activeProject.episodes ?? []).map((episode) => (
                  <option key={episode.id} value={episode.id}>{episode.title} · {episode.entries.length} บรรทัด</option>
                ))}
              </select>
              <button onClick={saveEpisode} disabled={entries.length === 0 || loading} className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium hover:bg-violet-500 disabled:opacity-40">{currentEpisodeId ? "บันทึกการแก้ไขตอน" : "บันทึกเป็นตอนใหม่"}</button>
              <button onClick={deleteEpisode} disabled={!currentEpisodeId || loading} className="rounded-lg border border-red-500/30 px-3 py-2.5 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-30">ลบตอน</button>
            </div>
            {currentEpisodeId && <p className="mt-2 text-xs text-violet-300">กำลังแก้ไขตอนที่บันทึกไว้ · อย่าลืมกดบันทึกหลังแก้คำแปล</p>}
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
                          <button title="ลบ" onClick={() => updateActiveProject({ characters: activeProject.characters.filter((item) => item.id !== character.id) })} className="rounded p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-400"><Trash2 size={15} /></button>
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
                        <button title="ลบ" onClick={() => updateActiveProject({ glossary: activeProject.glossary.filter((entry) => entry.id !== item.id) })} className="rounded p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-400"><Trash2 size={15} /></button>
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
            <section className="mb-6 rounded-2xl border border-white/10 bg-[#12121c] p-5">
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
              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={translateAll} disabled={loading} className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 font-semibold hover:bg-violet-500 disabled:opacity-50">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Languages size={18} />}
                  {loading ? "กำลังแปล..." : "เริ่มแปลทั้งหมด"}
                </button>
                <button onClick={downloadSRT} disabled={translatedCount === 0} className="flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 font-semibold hover:bg-white/10 disabled:opacity-40"><Download size={18} /> ดาวน์โหลด SRT</button>
              </div>
              {loading && <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${progress}%` }} /></div>}
              {success && <p className="mt-4 flex items-center gap-2 text-sm text-green-400"><CheckCircle2 size={18} /> แปลครบทุกบรรทัดแล้ว สามารถแก้ไขและดาวน์โหลดได้</p>}
              {error && <p className="mt-4 flex items-start gap-2 text-sm text-red-400"><AlertCircle size={18} className="shrink-0" /> {error}</p>}
            </section>

            <section>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold">Subtitle Editor</h2>
                <div className="relative w-full md:w-72"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาซับ..." className="w-full rounded-xl border border-white/10 bg-[#12121c] py-3 pl-10 pr-4 text-sm outline-none focus:border-violet-500" /></div>
              </div>
              <div className="space-y-3">
                {filteredEntries.map((entry) => {
                  const translated = translations[entry.id] ?? "";
                  const isEditing = editingId === entry.id;
                  return (
                    <article key={entry.id} className="rounded-xl border border-white/10 bg-[#12121c] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2"><span className="rounded-md bg-violet-500/15 px-2 py-1 text-xs text-violet-300">#{entry.id}</span><span className="text-xs text-gray-500">{entry.start} → {entry.end}</span></div>
                        {translated && <button onClick={() => setEditingId(isEditing ? null : entry.id)} className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"><Pencil size={14} />{isEditing ? "เสร็จ" : "แก้ไข"}</button>}
                      </div>
                      <p className="mb-2 text-xs font-semibold text-gray-500">JAPANESE</p>
                      <p className="whitespace-pre-wrap text-sm leading-7 text-gray-300">{entry.text}</p>
                      <div className="mt-4 border-t border-white/10 pt-4">
                        <p className="mb-2 text-xs font-semibold text-violet-400">THAI TRANSLATION</p>
                        {isEditing ? <textarea autoFocus value={translated} onChange={(event) => updateTranslation(entry.id, event.target.value)} rows={3} className="w-full rounded-xl border border-violet-500/40 bg-black/30 p-3 text-sm leading-7 text-white outline-none focus:border-violet-400" placeholder="พิมพ์คำแปลภาษาไทย..." /> : <p className={`whitespace-pre-wrap text-sm leading-7 ${translated ? "text-green-300" : "text-gray-600"}`}>{translated || "ยังไม่ได้แปล"}</p>}
                        {translated && !isEditing && <button onClick={() => setEditingId(entry.id)} className="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-white"><Pencil size={12} /> แก้คำแปล</button>}
                      </div>
                    </article>
                  );
                })}
              </div>
              {filteredEntries.length === 0 && <div className="rounded-xl bg-[#12121c] p-8 text-center text-gray-500">ไม่พบข้อความที่ค้นหา</div>}
            </section>
          </>
        )}

        <footer className="mt-12 border-t border-white/10 py-6 text-center text-xs text-gray-600">AI ANIME SUBTITLE TRANSLATOR</footer>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteSocialPost,
  generateSocialPost,
  getSocialPosts,
  publishSocialPost,
  scheduleSocialPost,
  type SocialPlatform,
  type SocialPost,
  type SocialStatus,
} from "@/lib/api";

type ToneOption = "Profesional" | "Casual" | "Divertido";

const toneOptions: ToneOption[] = ["Profesional", "Casual", "Divertido"];
const platformOptions: Array<{ value: SocialPlatform; label: string }> = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "both", label: "Ambas" },
];
function getStatusChip(status: SocialStatus): string {
  switch (status) {
    case "draft":
      return "bg-slate-500/20 text-slate-200 border-slate-400/30";
    case "scheduled":
      return "bg-amber-500/20 text-amber-200 border-amber-400/30";
    case "published":
      return "bg-emerald-500/20 text-emerald-200 border-emerald-400/30";
    case "failed":
      return "bg-red-500/20 text-red-200 border-red-400/30";
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

export default function SocialPage() {
  const [topic, setTopic] = useState<string>("promoción de cortes de cabello");
  const [tone, setTone] = useState<ToneOption>("Profesional");
  const [platform, setPlatform] = useState<SocialPlatform>("both");
  const [content, setContent] = useState<string>("");
  const [hashtags, setHashtags] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [showScheduler, setShowScheduler] = useState<boolean>(false);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [error, setError] = useState<string>("");
  const [isLoadingPosts, setIsLoadingPosts] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [isScheduling, setIsScheduling] = useState<boolean>(false);
  const preview = useMemo(() => `${content}${hashtags ? `\n\n${hashtags}` : ""}`, [content, hashtags]);
  const loadPosts = async () => {
    try {
      setIsLoadingPosts(true);
      const data = await getSocialPosts("demo", "all");
      setPosts(data);
    } catch {
      setError("No se pudo cargar el calendario de contenido.");
    } finally {
      setIsLoadingPosts(false);
    }
  };
  useEffect(() => {
    void loadPosts();
  }, []);
  const handleGenerate = async () => {
    try {
      setError("");
      setIsGenerating(true);
      const generated = await generateSocialPost({
        topic,
        tone,
        businessId: "demo",
      });
      setContent(generated.content);
      setHashtags(generated.hashtags);
    } catch {
      setError("No se pudo generar contenido con IA.");
    } finally {
      setIsGenerating(false);
    }
  };
  const handlePublishNow = async () => {
    try {
      setError("");
      setIsPublishing(true);
      await publishSocialPost({
        businessId: "demo",
        content,
        hashtags,
        imageUrl: imageUrl.trim() || undefined,
        platform,
      });
      await loadPosts();
    } catch {
      setError("No se pudo publicar en redes sociales.");
    } finally {
      setIsPublishing(false);
    }
  };
  const handleSchedule = async () => {
    try {
      if (!scheduledAt) {
        setError("Selecciona fecha y hora para programar.");
        return;
      }

      setError("");
      setIsScheduling(true);
      await scheduleSocialPost({
        businessId: "demo",
        content,
        hashtags,
        imageUrl: imageUrl.trim() || undefined,
        platform,
        scheduledAt: new Date(scheduledAt).toISOString(),
      });
      setShowScheduler(false);
      await loadPosts();
    } catch {
      setError("No se pudo programar la publicación.");
    } finally {
      setIsScheduling(false);
    }
  };
  const handleDeletePost = async (id: string) => {
    try {
      setError("");
      await deleteSocialPost(id);
      await loadPosts();
    } catch {
      setError("No se pudo eliminar la publicación.");
    }
  };
  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-white">Redes sociales</h2>
        <p className="mt-1 text-sm text-slate-400">Genera, publica y programa contenido con IA.</p>
      </header>

      {error ? (
        <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
      ) : null}

      <article className="space-y-4 rounded-xl border border-white/10 bg-ari-card p-4">
        <h3 className="text-lg font-semibold text-white">1. Generador de contenido con IA</h3>
        <label className="space-y-1 text-sm text-slate-300">
          <span>¿Sobre qué quieres publicar?</span>
          <input value={topic} onChange={(event) => setTopic(event.target.value)} className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent" />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm text-slate-300">
            <span>Tono</span>
            <select value={tone} onChange={(event) => setTone(event.target.value as ToneOption)} className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent">
              {toneOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-slate-300">
            <span>URL de imagen (opcional)</span>
            <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://..." className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent" />
          </label>
        </div>
        <button type="button" onClick={handleGenerate} disabled={isGenerating} className="inline-flex items-center gap-2 rounded-lg bg-ari-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-70">
          {isGenerating ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
          {isGenerating ? "Generando..." : "Generar con IA"}
        </button>

        <div className="rounded-2xl border border-white/10 bg-[#0d0f14] p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Preview Instagram</p>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-100 whitespace-pre-wrap">{preview || "Aquí verás el preview del post generado."}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handlePublishNow} disabled={!content || isPublishing} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-70">
            {isPublishing ? "Publicando..." : "Publicar ahora"}
          </button>
          <button type="button" onClick={() => setShowScheduler(true)} disabled={!content} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 disabled:opacity-70">
            Programar
          </button>
        </div>
      </article>

      {showScheduler ? (
        <article className="space-y-4 rounded-xl border border-white/10 bg-ari-card p-4">
          <h3 className="text-lg font-semibold text-white">2. Programador</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-300">
              <span>Fecha y hora</span>
              <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent" />
            </label>
            <label className="space-y-1 text-sm text-slate-300">
              <span>Plataforma</span>
              <select value={platform} onChange={(event) => setPlatform(event.target.value as SocialPlatform)} className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent">
                {platformOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <button type="button" onClick={handleSchedule} disabled={isScheduling || !content} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-70">
            {isScheduling ? "Programando..." : "Confirmar programación"}
          </button>
        </article>
      ) : null}

      <article className="space-y-3 rounded-xl border border-white/10 bg-ari-card p-4">
        <h3 className="text-lg font-semibold text-white">3. Calendario de contenido</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-slate-300">
              <tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Plataforma</th><th className="px-3 py-2">Preview texto</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Acciones</th></tr>
            </thead>
            <tbody>
              {isLoadingPosts ? (
                <tr><td colSpan={5} className="px-3 py-4 text-slate-400">Cargando publicaciones...</td></tr>
              ) : posts.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-4 text-slate-400">No hay publicaciones todavía.</td></tr>
              ) : (
                posts.map((post) => (
                  <tr key={post.id} className="border-t border-white/5">
                    <td className="px-3 py-2 text-slate-200">{formatDate(post.scheduled_at || post.published_at || post.created_at)}</td>
                    <td className="px-3 py-2 capitalize text-slate-200">{post.platform}</td>
                    <td className="max-w-[420px] truncate px-3 py-2 text-slate-300">{post.content}</td>
                    <td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusChip(post.status)}`}>{post.status}</span></td>
                    <td className="px-3 py-2"><button type="button" onClick={() => handleDeletePost(post.id)} className="rounded-md bg-red-500/20 px-2 py-1 text-xs font-medium text-red-200 hover:bg-red-500/30">Eliminar</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

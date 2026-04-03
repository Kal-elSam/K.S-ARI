"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  createSocialImage,
  deleteSocialImage,
  generateSocialPost,
  getSocialImages,
  getSocialPosts,
  getSocialPreviewImage,
  getSocialScheduleConfig,
  publishSocialNow,
  type SocialPost,
  type SocialImage,
  type SocialScheduleConfig,
  type SocialSchedulePlatform,
  toggleSocialSchedule,
  upsertSocialScheduleConfig,
} from "@/lib/api";
import { SocialFeedback } from "@/features/social/components/social-feedback";
import { SocialTabsNav } from "@/features/social/components/social-tabs-nav";
import {
  type TabKey,
  type ToneOption,
  frequencyOptions,
  formatDate,
  getNextPostFromSchedule,
  getStatusChip,
  imageSourceOptions,
  platformOptions,
  toneOptions,
  useNextPostLabel,
  useSocialPreview,
} from "@/features/social/hooks/use-social-ui";

export default function SocialPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("publicar");
  const [topic, setTopic] = useState<string>("servicios");
  const [tone, setTone] = useState<ToneOption>("Profesional");
  const [content, setContent] = useState<string>("");
  const [hashtags, setHashtags] = useState<string>("");
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [images, setImages] = useState<SocialImage[]>([]);
  const [schedule, setSchedule] = useState<SocialScheduleConfig>({
    business_id: "demo",
    is_active: false,
    frequency: "daily",
    post_times: ["10:00", "18:00"],
    topics: ["servicios", "promociones", "tips"],
    platforms: ["instagram", "facebook"],
    tone: "Profesional",
    image_source: "auto",
  });
  const [newTime, setNewTime] = useState<string>("");
  const [newTopic, setNewTopic] = useState<string>("");
  const [imageUrlInput, setImageUrlInput] = useState<string>("");
  const [imageTagsInput, setImageTagsInput] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [nextPostOverride, setNextPostOverride] = useState<string | null>(null);
  const [isLoadingPosts, setIsLoadingPosts] = useState<boolean>(true);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState<boolean>(true);
  const [isLoadingImages, setIsLoadingImages] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState<boolean>(false);
  const [isTogglingSchedule, setIsTogglingSchedule] = useState<boolean>(false);
  const [isAddingImage, setIsAddingImage] = useState<boolean>(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isLoadingPreviewImage, setIsLoadingPreviewImage] = useState<boolean>(false);

  const preview = useSocialPreview(content, hashtags);
  const nextPostLabel = useNextPostLabel(schedule, nextPostOverride);

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

  const loadSchedule = async () => {
    try {
      setIsLoadingSchedule(true);
      const config = await getSocialScheduleConfig("demo");
      setSchedule({
        ...config,
        post_times: config.post_times.length > 0 ? config.post_times : ["10:00", "18:00"],
        topics: config.topics.length > 0 ? config.topics : ["servicios", "promociones", "tips"],
        platforms: config.platforms.length > 0 ? config.platforms : ["instagram", "facebook"],
      });
      setTone((config.tone as ToneOption) || "Profesional");
      setNextPostOverride(getNextPostFromSchedule(config));
    } catch {
      setError("No se pudo cargar la configuración de automatización.");
    } finally {
      setIsLoadingSchedule(false);
    }
  };

  const loadImages = async () => {
    try {
      setIsLoadingImages(true);
      const data = await getSocialImages("demo");
      setImages(data);
    } catch {
      setError("No se pudo cargar el banco de imágenes.");
    } finally {
      setIsLoadingImages(false);
    }
  };

  useEffect(() => {
    void loadPosts();
    void loadSchedule();
    void loadImages();
  }, []);

  const loadPreviewImage = useCallback(async () => {
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) {
      setPreviewImageUrl(null);
      return;
    }
    setIsLoadingPreviewImage(true);
    try {
      const { imageUrl } = await getSocialPreviewImage({ topic: trimmedTopic, businessId: "demo" });
      setPreviewImageUrl(imageUrl?.trim() || null);
    } catch {
      setPreviewImageUrl(null);
    } finally {
      setIsLoadingPreviewImage(false);
    }
  }, [topic]);

  /** Vista previa de imagen al abrir «Publicar ahora» o al cambiar tema / fuente de imagen (no solo tras Generar). */
  useEffect(() => {
    if (activeTab !== "publicar" || !topic.trim()) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void loadPreviewImage();
    }, 400);
    return () => window.clearTimeout(timeoutId);
  }, [activeTab, topic, schedule.image_source, loadPreviewImage]);

  const handleGenerate = async () => {
    try {
      setError("");
      setSuccess("");
      setIsGenerating(true);
      const generated = await generateSocialPost({
        topic,
        tone,
        businessId: "demo",
      });
      setContent(generated.content);
      setHashtags(generated.hashtags);
      await loadPreviewImage();
    } catch {
      setError("No se pudo generar contenido con IA.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublishNow = async () => {
    try {
      setError("");
      setSuccess("");
      setIsPublishing(true);
      await publishSocialNow({
        businessId: "demo",
        topic,
        tone,
        platforms: schedule.platforms,
        ...(content.trim() ? { content, hashtags } : {}),
        ...(previewImageUrl?.trim() ? { imageUrl: previewImageUrl.trim() } : {}),
      });
      await loadPosts();
      setSuccess("Publicación enviada con éxito.");
    } catch {
      setError("No se pudo publicar en redes sociales.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveSchedule = async () => {
    try {
      setError("");
      setSuccess("");
      setIsSavingSchedule(true);
      const saved = await upsertSocialScheduleConfig({
        businessId: "demo",
        frequency: schedule.frequency,
        post_times: schedule.post_times,
        topics: schedule.topics,
        platforms: schedule.platforms,
        tone: schedule.tone,
        image_source: schedule.image_source,
      });
      setSchedule(saved);
      setNextPostOverride(getNextPostFromSchedule(saved));
      setSuccess("Configuración guardada correctamente.");
    } catch {
      setError("No se pudo guardar la configuración.");
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleToggleAutomation = async (active: boolean) => {
    try {
      setError("");
      setSuccess("");
      setIsTogglingSchedule(true);
      const result = await toggleSocialSchedule({ businessId: "demo", active });
      setSchedule((previous) => ({ ...previous, is_active: result.is_active }));
      setNextPostOverride(result.nextPost);
      setSuccess(active ? "Automatización activada." : "Automatización pausada.");
    } catch {
      setError("No se pudo cambiar el estado de automatización.");
    } finally {
      setIsTogglingSchedule(false);
    }
  };

  const addTimeChip = () => {
    if (!newTime) return;
    if (schedule.post_times.includes(newTime)) {
      setNewTime("");
      return;
    }
    setSchedule((previous) => ({ ...previous, post_times: [...previous.post_times, newTime].sort() }));
    setNewTime("");
  };

  const removeTimeChip = (time: string) => {
    setSchedule((previous) => ({
      ...previous,
      post_times: previous.post_times.filter((value) => value !== time),
    }));
  };

  const addTopicChip = () => {
    const normalized = newTopic.trim();
    if (!normalized) return;
    if (schedule.topics.includes(normalized)) {
      setNewTopic("");
      return;
    }
    setSchedule((previous) => ({ ...previous, topics: [...previous.topics, normalized] }));
    setNewTopic("");
  };

  const removeTopicChip = (topicName: string) => {
    setSchedule((previous) => ({
      ...previous,
      topics: previous.topics.filter((value) => value !== topicName),
    }));
  };

  const togglePlatform = (platform: SocialSchedulePlatform) => {
    setSchedule((previous) => {
      const exists = previous.platforms.includes(platform);
      const next = exists
        ? previous.platforms.filter((value) => value !== platform)
        : [...previous.platforms, platform];
      return {
        ...previous,
        platforms: next.length > 0 ? next : previous.platforms,
      };
    });
  };

  const handleAddImage = async () => {
    try {
      if (!imageUrlInput.trim()) {
        setError("La URL de imagen es obligatoria.");
        return;
      }
      setError("");
      setSuccess("");
      setIsAddingImage(true);
      const topicTags = imageTagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      await createSocialImage({
        businessId: "demo",
        url: imageUrlInput.trim(),
        topic_tags: topicTags,
      });
      setImageUrlInput("");
      setImageTagsInput("");
      await loadImages();
      setSuccess("Imagen agregada al banco.");
    } catch {
      setError("No se pudo agregar la imagen.");
    } finally {
      setIsAddingImage(false);
    }
  };

  const handleDeleteImage = async (id: string) => {
    try {
      setError("");
      setSuccess("");
      await deleteSocialImage(id);
      await loadImages();
      setSuccess("Imagen eliminada.");
    } catch {
      setError("No se pudo eliminar la imagen.");
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-white">Redes sociales</h2>
        <p className="mt-1 text-sm text-slate-400">Publica ahora, automatiza y gestiona tu banco de imágenes.</p>
      </header>

      <SocialFeedback error={error} success={success} />
      <SocialTabsNav activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "publicar" ? (
        <article className="space-y-4 rounded-xl border border-white/10 bg-ari-card p-4">
          <h3 className="text-lg font-semibold text-white">Publicar ahora</h3>
          <label className="space-y-1 text-sm text-slate-300">
            <span>Tema del post</span>
            <input value={topic} onChange={(event) => setTopic(event.target.value)} className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent" />
          </label>
          <label className="space-y-1 text-sm text-slate-300">
            <span>Tono</span>
            <select value={tone} onChange={(event) => setTone(event.target.value as ToneOption)} className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent">
              {toneOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleGenerate} disabled={isGenerating} className="inline-flex items-center gap-2 rounded-lg bg-ari-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-70">
              {isGenerating ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
              {isGenerating ? "Generando..." : "Generar con IA"}
            </button>
            <button type="button" onClick={handlePublishNow} disabled={isPublishing || !topic.trim()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-70">
              {isPublishing ? "Publicando..." : "Publicar ahora con 1 click"}
            </button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#0d0f14] p-4">
              <p className="text-xs uppercase tracking-wider text-slate-400">Preview</p>
              <div className="mt-3 min-h-[120px] whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-100">
                {preview || "Aquí verás el texto del post generado (o escribe tema y espera la vista previa de imagen al lado)."}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0d0f14] p-4">
              <p className="text-xs uppercase tracking-wider text-slate-400">Vista previa de imagen</p>
              <p className="mt-1 text-xs text-slate-500">Se actualiza con el tema del post (misma imagen que se usará al publicar si no eliges otra).</p>
              {isLoadingPreviewImage ? (
                <div className="mt-3 flex aspect-square max-w-sm items-center justify-center rounded-xl border border-white/10 bg-black/20">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                </div>
              ) : previewImageUrl ? (
                <div className="mt-3 space-y-3">
                  <div className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl border border-white/10 bg-black/40">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL Unsplash dinámica, object-fit cuadrado */}
                    <img src={previewImageUrl} alt="" className="h-full w-full object-cover" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void loadPreviewImage();
                    }}
                    disabled={isLoadingPreviewImage || !topic.trim()}
                    className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50"
                  >
                    🔄 Cambiar imagen
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  Escribe un tema arriba: cargamos una imagen de ejemplo automáticamente, o usa «Generar con IA».
                </p>
              )}
            </div>
          </div>
        </article>
      ) : null}

      {activeTab === "automatizacion" ? (
        <article className="space-y-4 rounded-xl border border-white/10 bg-ari-card p-4">
          <h3 className="text-lg font-semibold text-white">Automatización</h3>
          <div className={`rounded-xl border px-4 py-3 ${schedule.is_active ? "border-emerald-400/30 bg-emerald-500/10" : "border-slate-500/30 bg-slate-500/10"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={`text-sm font-semibold ${schedule.is_active ? "text-emerald-200" : "text-slate-300"}`}>
                {schedule.is_active ? "Automatización activa" : "Automatización pausada"}
              </p>
              <button type="button" onClick={() => handleToggleAutomation(!schedule.is_active)} disabled={isTogglingSchedule || isLoadingSchedule} className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${schedule.is_active ? "bg-emerald-600" : "bg-slate-600"} disabled:opacity-70`}>
                {isTogglingSchedule ? "Procesando..." : schedule.is_active ? "Pausar" : "Activar"}
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-200">Próxima publicación: {nextPostLabel}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-300">
              <span>Frecuencia</span>
              <select value={schedule.frequency} onChange={(event) => setSchedule((previous) => ({ ...previous, frequency: event.target.value as SocialScheduleConfig["frequency"] }))} className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent">
                {frequencyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm text-slate-300">
              <span>Tono</span>
              <select value={schedule.tone} onChange={(event) => setSchedule((previous) => ({ ...previous, tone: event.target.value }))} className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent">
                {toneOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="space-y-2 text-sm text-slate-300">
            <p>Plataformas</p>
            <div className="flex flex-wrap gap-2">
              {platformOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => togglePlatform(option.value)}
                  className={`rounded-lg border px-3 py-1.5 ${
                    schedule.platforms.includes(option.value)
                      ? "border-ari-accent bg-ari-accent/20 text-white"
                      : "border-white/10 bg-white/5 text-slate-300"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 text-sm text-slate-300">
            <p>Horarios</p>
            <div className="flex flex-wrap gap-2">
              {schedule.post_times.map((time) => (
                <button key={time} type="button" onClick={() => removeTimeChip(time)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                  {time} ×
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="time" value={newTime} onChange={(event) => setNewTime(event.target.value)} className="rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent" />
              <button type="button" onClick={addTimeChip} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                Agregar
              </button>
            </div>
          </div>
          <div className="space-y-2 text-sm text-slate-300">
            <p>Temas</p>
            <div className="flex flex-wrap gap-2">
              {schedule.topics.map((topicName) => (
                <button key={topicName} type="button" onClick={() => removeTopicChip(topicName)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                  {topicName} ×
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newTopic} onChange={(event) => setNewTopic(event.target.value)} placeholder="Ej. tips de salud bucal" className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent" />
              <button type="button" onClick={addTopicChip} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                Agregar
              </button>
            </div>
          </div>
          <label className="space-y-1 text-sm text-slate-300">
            <span>Fuente de imagen</span>
            <select value={schedule.image_source} onChange={(event) => setSchedule((previous) => ({ ...previous, image_source: event.target.value as SocialScheduleConfig["image_source"] }))} className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent">
              {imageSourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={handleSaveSchedule} disabled={isSavingSchedule || isLoadingSchedule} className="rounded-lg bg-ari-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-70">
            {isSavingSchedule ? "Guardando..." : "Guardar configuración"}
          </button>
        </article>
      ) : null}

      {activeTab === "imagenes" ? (
        <article className="space-y-4 rounded-xl border border-white/10 bg-ari-card p-4">
          <h3 className="text-lg font-semibold text-white">Banco de imágenes</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-300">
              <span>URL de imagen</span>
              <input value={imageUrlInput} onChange={(event) => setImageUrlInput(event.target.value)} placeholder="https://..." className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent" />
            </label>
            <label className="space-y-1 text-sm text-slate-300">
              <span>Tags separados por coma</span>
              <input value={imageTagsInput} onChange={(event) => setImageTagsInput(event.target.value)} placeholder="corte, barbería, estilo" className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-white outline-none focus:border-ari-accent" />
            </label>
          </div>
          <button type="button" onClick={handleAddImage} disabled={isAddingImage} className="rounded-lg bg-ari-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-70">
            {isAddingImage ? "Agregando..." : "Agregar al banco"}
          </button>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {isLoadingImages ? (
              <p className="text-sm text-slate-400">Cargando imágenes...</p>
            ) : images.length === 0 ? (
              <p className="text-sm text-slate-400">No hay imágenes en el banco.</p>
            ) : (
              images.map((image) => (
                <article key={image.id} className="space-y-2 rounded-lg border border-white/10 bg-[#111217] p-3">
                  <Image
                    src={image.url}
                    alt="Imagen del negocio"
                    width={640}
                    height={360}
                    className="h-36 w-full rounded object-cover"
                  />
                  <p className="line-clamp-2 text-xs text-slate-300">{image.topic_tags.join(", ") || "Sin tags"}</p>
                  <button type="button" onClick={() => handleDeleteImage(image.id)} className="rounded-md bg-red-500/20 px-2 py-1 text-xs font-medium text-red-200 hover:bg-red-500/30">
                    Eliminar
                  </button>
                </article>
              ))
            )}
          </div>
        </article>
      ) : null}

      {activeTab === "historial" ? (
        <article className="space-y-3 rounded-xl border border-white/10 bg-ari-card p-4">
          <h3 className="text-lg font-semibold text-white">Historial</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left text-slate-300">
                <tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Plataforma</th><th className="px-3 py-2">Preview texto</th><th className="px-3 py-2">Estado</th></tr>
              </thead>
              <tbody>
                {isLoadingPosts ? (
                  <tr><td colSpan={4} className="px-3 py-4 text-slate-400">Cargando publicaciones...</td></tr>
                ) : posts.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-4 text-slate-400">No hay publicaciones todavía.</td></tr>
                ) : (
                  posts.map((post) => (
                    <tr key={post.id} className="border-t border-white/5">
                      <td className="px-3 py-2 text-slate-200">{formatDate(post.scheduled_at || post.published_at || post.created_at)}</td>
                      <td className="px-3 py-2 capitalize text-slate-200">{post.platform}</td>
                      <td className="max-w-[420px] truncate px-3 py-2 text-slate-300">{post.content}</td>
                      <td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusChip(post.status)}`}>{post.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </section>
  );
}

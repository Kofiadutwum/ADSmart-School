"use client";

import { useState, type FormEvent } from "react";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { deleteJson, errorMessage, fieldErrors, patchJson, postForm, postJson } from "@/lib/client-api";
import type { AdminGalleryPhoto } from "@/lib/types";
import { CHECK_FORM, ConfirmDelete, LoadState, OrderButtons, Tick, WEBSITE_API, firstProblem, moved, useLoad } from "./shared";

const URL = `${WEBSITE_API}/gallery`;
const NEEDS_PERMISSION = "Tick that you have permission to publish everyone in this photo.";
const PERMISSION_LABEL =
  "I have permission to publish everyone in this photo, including parents' permission for any children";

/** The gallery on your website (business tools spec §5.2). */
export function GalleryManager() {
  const { data: photos, setData: setPhotos, error } = useLoad<AdminGalleryPhoto[]>(URL);
  const [problem, setProblem] = useState<string | null>(null);

  async function move(index: number, delta: -1 | 1) {
    if (!photos) return;
    setProblem(null);
    try {
      const ids = moved(photos, index, delta).map((photo) => photo.id);
      setPhotos(await postJson<AdminGalleryPhoto[]>(`${URL}/order`, { ids }));
    } catch (caught) {
      setProblem(errorMessage(caught));
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Gallery</h1>
        <p className="mt-1 text-ink-muted">Photos on your website. Up to 12 show on the home page, in this order.</p>
      </div>
      <AddPhoto onAdded={(photo) => setPhotos((list) => [...(list ?? []), photo])} />
      <section aria-labelledby="gallery-photos" className="space-y-4">
        <h2 id="gallery-photos" className="text-xl font-semibold">
          Your photos
        </h2>
        {problem && (
          <p role="alert" className="text-danger">
            {problem}
          </p>
        )}
        <LoadState error={error} loading={photos === null} empty={photos?.length === 0} emptyText="No photos yet." />
        {photos && photos.length > 0 && (
          <ul className="grid gap-4">
            {photos.map((photo, index) => (
              <li key={photo.id}>
                <PhotoCard
                  photo={photo}
                  index={index}
                  count={photos.length}
                  onMove={(delta) => move(index, delta)}
                  onSaved={(saved) => setPhotos((list) => list?.map((row) => (row.id === saved.id ? saved : row)) ?? null)}
                  onDeleted={() => setPhotos((list) => list?.filter((row) => row.id !== photo.id) ?? null)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AddPhoto({ onAdded }: { onAdded: (photo: AdminGalleryPhoto) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [showsPeople, setShowsPeople] = useState(false);
  const [permission, setPermission] = useState(false);
  const [visible, setVisible] = useState(true);
  const [fileKey, setFileKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!file) found.image = "Choose a photo.";
    if (!alt.trim()) found.alt_text = "Describe the photo for blind visitors.";
    if (showsPeople && !permission && visible) found.people_permission = NEEDS_PERMISSION;
    if (Object.keys(found).length > 0 || !file) {
      setError(CHECK_FORM);
      setErrors(found);
      setAttempt((count) => count + 1);
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("alt_text", alt);
      form.append("caption", caption);
      form.append("shows_people", String(showsPeople));
      form.append("people_permission", String(permission));
      form.append("visible", String(visible));
      onAdded(await postForm<AdminGalleryPhoto>(URL, form));
      setFile(null);
      setFileKey((key) => key + 1);
      setAlt("");
      setCaption("");
      setShowsPeople(false);
      setPermission(false);
      setError(null);
      setErrors({});
    } catch (caught) {
      setError(errorMessage(caught));
      setErrors(fieldErrors(caught));
      setAttempt((count) => count + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-labelledby="add-photo-title"
      className="surface max-w-xl space-y-5 rounded-card p-5 shadow-elev-1"
    >
      <h2 id="add-photo-title" className="text-xl font-semibold">
        Add a photo
      </h2>
      <FormAlert message={error} focusKey={attempt} />
      <Field id="photo-file" label="Photo" hint="JPEG, PNG or WebP." required error={errors.image}>
        {(props) => (
          <input
            {...props}
            key={fileKey}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className={inputClasses}
          />
        )}
      </Field>
      <Field id="photo-alt" label="Description" hint="What the photo shows, for blind visitors." required error={errors.alt_text}>
        {(props) => <input {...props} value={alt} onChange={(event) => setAlt(event.target.value)} className={inputClasses} />}
      </Field>
      <Field id="photo-caption" label="Caption" error={errors.caption}>
        {(props) => (
          <input {...props} value={caption} onChange={(event) => setCaption(event.target.value)} className={inputClasses} />
        )}
      </Field>
      <div>
        <Tick label="Shows people" checked={showsPeople} onChange={setShowsPeople} />
        {showsPeople && <Tick label={PERMISSION_LABEL} checked={permission} onChange={setPermission} />}
        {errors.people_permission && <p className="text-sm text-danger">{errors.people_permission}</p>}
        <Tick label="Show on the website" checked={visible} onChange={setVisible} />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Uploading…" : "Add photo"}
      </Button>
    </form>
  );
}

type CardProps = {
  photo: AdminGalleryPhoto;
  index: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
  onSaved: (photo: AdminGalleryPhoto) => void;
  onDeleted: () => void;
};

function PhotoCard({ photo, index, count, onMove, onSaved, onDeleted }: CardProps) {
  const [editing, setEditing] = useState(false);
  const [alt, setAlt] = useState(photo.alt_text);
  const [caption, setCaption] = useState(photo.caption);
  const [permission, setPermission] = useState(photo.people_permission);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const titleId = `photo-${photo.id}-title`;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setProblem(null);
    try {
      await action();
    } catch (caught) {
      setProblem(firstProblem(caught));
      setAttempt((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  const change = (data: Partial<AdminGalleryPhoto>) =>
    run(async () => onSaved(await patchJson<AdminGalleryPhoto>(`${URL}/${photo.id}`, data)));

  return (
    <article aria-labelledby={titleId} className="surface flex flex-wrap gap-4 rounded-card p-4 shadow-elev-1">
      {photo.image && <ResponsiveImage image={photo.image} sizes="160px" className="h-28 w-40 rounded-control object-cover" />}
      <div className="min-w-0 flex-1 space-y-2">
        <h3 id={titleId} className="font-semibold">
          {photo.alt_text}
        </h3>
        {photo.caption && <p className="text-sm">{photo.caption}</p>}
        <p className="flex flex-wrap gap-x-3 text-sm text-ink-muted">
          <span>{photo.visible ? "On your website" : "Hidden"}</span>
          {photo.shows_people && !photo.people_permission && <span>Needs permission before it can show</span>}
        </p>
        <FormAlert message={problem} focusKey={attempt} />
        {editing && (
          <div className="space-y-3">
            <Field id={`photo-${photo.id}-alt`} label="Description" required>
              {(props) => <input {...props} value={alt} onChange={(event) => setAlt(event.target.value)} className={inputClasses} />}
            </Field>
            <Field id={`photo-${photo.id}-caption`} label="Caption">
              {(props) => (
                <input {...props} value={caption} onChange={(event) => setCaption(event.target.value)} className={inputClasses} />
              )}
            </Field>
            {photo.shows_people && <Tick label={PERMISSION_LABEL} checked={permission} onChange={setPermission} />}
            <div className="flex gap-3">
              <Button
                disabled={busy}
                onClick={() =>
                  change({ alt_text: alt, caption, people_permission: permission }).then(() => setEditing(false))
                }
              >
                Save
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!editing && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          <Button variant="outline" disabled={busy} onClick={() => change({ visible: !photo.visible })}>
            {photo.visible ? "Hide" : "Show"}
          </Button>
          <OrderButtons label={photo.alt_text} index={index} count={count} disabled={busy} onMove={onMove} />
          <ConfirmDelete
            busy={busy}
            onConfirm={() =>
              run(async () => {
                await deleteJson(`${URL}/${photo.id}`);
                onDeleted();
              })
            }
          />
        </div>
      </div>
    </article>
  );
}

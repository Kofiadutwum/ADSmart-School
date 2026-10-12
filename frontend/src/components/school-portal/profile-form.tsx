"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CHECK_FORM, firstProblem, LoadState, useLoad } from "@/components/portal/kit";
import { SaveBar } from "@/components/portal/save-bar";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { deleteJson, errorMessage, fieldErrors, patchJson, postForm } from "@/lib/client-api";
import type { SchoolProfile } from "@/lib/types";

const PROFILE = "/api/school/profile";
const TEXT_FIELDS = [
  "motto",
  "address",
  "town",
  "region",
  "ghana_post_gps",
  "phone",
  "whatsapp",
  "email",
  "map_query",
  "brand_primary",
  "brand_accent",
] as const;
type TextField = (typeof TEXT_FIELDS)[number];
type Values = Record<TextField, string> & { founded_year: string; levels_offered: string[] };

const FIELDS: [TextField | "founded_year", string, boolean, string?][] = [
  ["motto", "Motto", false],
  ["founded_year", "Year founded", false],
  ["address", "Address", false, "Street or landmark, as parents would describe it."],
  ["town", "Town", true],
  ["region", "Region", true],
  ["ghana_post_gps", "GhanaPost GPS", false, "For example AK-039-5028."],
  ["phone", "Phone", true],
  ["whatsapp", "WhatsApp", false, "A mobile number."],
  ["email", "Email", true],
  ["map_query", "Map search words", false, "What to search on the map to find the school."],
];
const COLOURS: ["brand_primary" | "brand_accent", string, string, string][] = [
  ["brand_primary", "Main colour", "Buttons with white text, and links. It must be dark enough.", "#ffffff"],
  ["brand_accent", "Accent colour", "The main call to action, with dark text. It must be light enough.", "#0b0a1f"],
];
const HEX = /^#[0-9a-f]{6}$/i;

function valuesOf(profile: SchoolProfile): Values {
  const text = Object.fromEntries(TEXT_FIELDS.map((name) => [name, profile[name]])) as Record<TextField, string>;
  return { ...text, founded_year: profile.founded_year?.toString() ?? "", levels_offered: profile.levels_offered };
}

/** The server's "Try #xxxxxx" advice for a colour that is hard to read. */
function suggestionIn(message: string | undefined): string | undefined {
  return message?.match(/Try (#[0-9a-f]{6})/i)?.at(1);
}

/** The school's own profile, levels, logo and colours (Phase 1 spec §3.1, §7.2). The name and
 * web address stay with the platform team. */
export function ProfileForm({ canEdit }: { canEdit: boolean }) {
  const { data, setData, error: loadError } = useLoad<SchoolProfile>(PROFILE);
  const [values, setValues] = useState<Values | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setValues((current) => current ?? valuesOf(data));
  }, [data]);

  if (!data || !values) return <LoadState error={loadError} loading={!loadError} empty={false} emptyText="" />;
  const profile = data;
  const form = values;

  const set = (name: keyof Values, value: string | string[]) => setValues({ ...form, [name]: value } as Values);

  function fail(message: string, found: Record<string, string>) {
    setError(message);
    setErrors(found);
    setAttempt((count) => count + 1);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    if (form.levels_offered.length === 0) return fail(CHECK_FORM, { levels_offered: "Choose at least one level." });
    setBusy(true);
    try {
      const saved = await patchJson<SchoolProfile>(PROFILE, {
        ...form,
        founded_year: form.founded_year ? Number(form.founded_year) : null,
      });
      setData(saved);
      setValues(valuesOf(saved));
      setErrors({});
      setError(null);
      setNotice("Saved.");
    } catch (caught) {
      fail(errorMessage(caught), fieldErrors(caught));
    } finally {
      setBusy(false);
    }
  }

  function toggleLevel(code: string, on: boolean) {
    const codes = profile.level_choices.map((choice) => choice.code);
    set(
      "levels_offered",
      codes.filter((each) => (each === code ? on : form.levels_offered.includes(each))),
    );
  }

  return (
    <div className="space-y-8">
      <LogoSection profile={profile} canEdit={canEdit} onSaved={setData} />
      <form noValidate onSubmit={onSubmit} aria-labelledby="profile-title" className="space-y-6">
        <div>
          <h2 id="profile-title" className="text-xl font-semibold">
            {profile.name}
          </h2>
          <p className="text-sm text-ink-muted">
            To change the school&apos;s name or web address, contact the platform team.
          </p>
        </div>
        <FormAlert message={error} focusKey={attempt} />
        <div className="grid gap-5 lg:grid-cols-2">
          {FIELDS.map(([name, label, required, hint]) => (
            <Field key={name} id={`profile-${name}`} label={label} hint={hint} required={required} error={errors[name]}>
              {(props) => (
                <input
                  {...props}
                  type={name === "email" ? "email" : name === "phone" || name === "whatsapp" ? "tel" : "text"}
                  inputMode={name === "founded_year" ? "numeric" : undefined}
                  value={form[name]}
                  disabled={!canEdit}
                  onChange={(event) => set(name, event.target.value)}
                  className={inputClasses}
                />
              )}
            </Field>
          ))}
        </div>
        <fieldset aria-describedby={errors.levels_offered ? "levels-error" : undefined}>
          <legend className="font-medium">Levels taught</legend>
          <div className="mt-1 flex flex-wrap gap-x-6">
            {profile.level_choices.map((level) => (
              <label key={level.code} className="inline-flex min-h-11 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={form.levels_offered.includes(level.code)}
                  onChange={(event) => toggleLevel(level.code, event.target.checked)}
                  className="size-5 accent-indigo"
                />
                {level.name}
              </label>
            ))}
          </div>
          {errors.levels_offered && (
            <p id="levels-error" className="mt-1 text-sm text-danger">
              {errors.levels_offered}
            </p>
          )}
        </fieldset>
        <div className="grid gap-5 lg:grid-cols-2">
          {COLOURS.map(([name, label, hint, text]) => {
            const suggestion = suggestionIn(errors[name]);
            return (
              <div key={name} className="space-y-2">
                <Field id={`profile-${name}`} label={label} hint={hint} required error={errors[name]}>
                  {(props) => (
                    <div className="flex items-center gap-3">
                      <input
                        {...props}
                        value={form[name]}
                        disabled={!canEdit}
                        onChange={(event) => set(name, event.target.value)}
                        spellCheck={false}
                        className={inputClasses}
                      />
                      <span
                        aria-hidden
                        className="inline-flex min-h-12 min-w-24 items-center justify-center rounded-control border border-line px-3 font-semibold"
                        style={{ background: HEX.test(form[name]) ? form[name] : "transparent", color: text }}
                      >
                        Sample
                      </span>
                    </div>
                  )}
                </Field>
                {suggestion && canEdit && (
                  <Button variant="outline" onClick={() => set(name, suggestion)}>
                    Use {suggestion}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {canEdit && (
          <SaveBar>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            {notice && (
              <p role="status" className="text-sm">
                {notice}
              </p>
            )}
          </SaveBar>
        )}
      </form>
    </div>
  );
}

type LogoProps = { profile: SchoolProfile; canEdit: boolean; onSaved: (profile: SchoolProfile) => void };

function LogoSection({ profile, canEdit, onSaved }: LogoProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<SchoolProfile>) {
    setBusy(true);
    setError(null);
    try {
      onSaved(await action());
      setFile(null);
    } catch (caught) {
      setError(firstProblem(caught));
    } finally {
      setBusy(false);
    }
  }

  function upload() {
    if (!file) return;
    const body = new FormData();
    body.append("logo", file);
    void run(() => postForm<SchoolProfile>(`${PROFILE}/logo`, body));
  }

  return (
    <section
      aria-labelledby="logo-title"
      className="surface flex flex-wrap items-center gap-5 rounded-card p-5 shadow-elev-1"
    >
      {profile.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- an uploaded rendition with its own srcset
        <img
          src={profile.logo.src}
          srcSet={profile.logo.srcset}
          sizes="96px"
          alt={profile.logo.alt}
          className="size-24 rounded-control object-contain"
        />
      ) : (
        <span className="inline-flex size-24 items-center justify-center rounded-control bg-ink/5 text-sm text-ink-muted">
          No logo
        </span>
      )}
      <div className="space-y-3">
        <h2 id="logo-title" className="text-lg font-semibold">
          Logo
        </h2>
        {canEdit && (
          <>
            <label className="block text-sm font-medium">
              Choose a logo (JPEG, PNG or WebP)
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="mt-1 block text-sm"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <Button disabled={!file || busy} onClick={upload}>
                Upload logo
              </Button>
              {profile.logo && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(() => deleteJson<SchoolProfile>(`${PROFILE}/logo`))}
                >
                  Remove logo
                </Button>
              )}
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

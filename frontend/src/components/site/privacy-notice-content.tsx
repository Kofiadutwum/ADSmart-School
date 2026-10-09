import { RichText } from "@/components/ui/rich-text";
import { formatDate } from "@/lib/dates";
import type { PrivacyNotice } from "@/lib/types";

/** The body of a privacy notice page, for a school or the platform (Act 843). */
export function PrivacyNoticeContent({ notice }: { notice: PrivacyNotice | null }) {
  if (!notice) return <p className="text-lg">Our privacy notice will be published here soon.</p>;
  return (
    <>
      {notice.is_draft && (
        <p role="note" className="surface mb-8 rounded-card p-4 font-medium">
          This notice is a draft and is still being reviewed.
        </p>
      )}
      <RichText text={notice.body} className="text-lg" />
      <p className="mt-10 text-sm text-ink-muted">
        Version {notice.version}, effective {formatDate(notice.effective_from)}.
      </p>
    </>
  );
}

import React from "react";
import { TriangleAlert } from "lucide-react";

export default function AccessNotice({ notice, sources }) {
  if (!notice) return null;
  return <aside className={sources ? "access-notice" : "access-notice access-notice-compact"}>
    <TriangleAlert size={18} aria-hidden="true" />
    <div>
      <strong>{notice.title}</strong>
      {sources && <>
        <p>{notice.text}</p>
        <div className="dossier-links">
          {notice.sources.map(id => <a key={id} href={sources[id].url} target="_blank" rel="noopener noreferrer">
            {sources[id].title}
          </a>)}
        </div>
      </>}
    </div>
  </aside>;
}

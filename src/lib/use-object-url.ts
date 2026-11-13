"use client";

import { useEffect, useState } from "react";

/** Object URL for a blob, revoked automatically when the blob changes or the component unmounts. */
export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!blob) return;
    const created = URL.createObjectURL(blob);
    // Creating the URL is a side effect that must pair with its cleanup, so it belongs in the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(created);
    return () => {
      URL.revokeObjectURL(created);
      setUrl(undefined);
    };
  }, [blob]);

  return url;
}

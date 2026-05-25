/**
 * Auto-follow hook — scrolls to the bottom of a container when new events
 * arrive and the user is already at the bottom.
 *
 * Spec: 05-logs.md §Design > Auto-follow logic
 *
 * Returns:
 *   ref          — attach to the scroll container element
 *   following    — true when auto-follow is engaged
 *   jumpToLatest — click handler: scrolls to bottom + re-engages auto-follow
 */

import { useCallback, useLayoutEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD_PX = 32;

export interface UseAutoFollowResult {
  ref: React.RefObject<HTMLDivElement | null>;
  following: boolean;
  jumpToLatest: () => void;
}

/**
 * @param eventCount — the current length of the events array; changes trigger
 *   the auto-scroll effect. Pass `events.length` from the caller.
 */
export function useAutoFollow(eventCount: number): UseAutoFollowResult {
  const ref = useRef<HTMLDivElement | null>(null);
  const [following, setFollowing] = useState(true);

  // Sync the following state when the user scrolls.
  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD_PX;
    setFollowing(atBottom);
  }, []);

  // Attach / detach scroll listener.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll]);

  // Auto-scroll when new events arrive and following is engaged.
  useLayoutEffect(() => {
    if (!following) return;
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight });
  }, [eventCount, following]);

  const jumpToLatest = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight });
    setFollowing(true);
  }, []);

  return { ref, following, jumpToLatest };
}

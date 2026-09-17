export interface MobileLayoutInput {
  width: number;
  height: number;
  hasTouchInput: boolean;
}

const MOBILE_PORTRAIT_MAX_WIDTH = 768;
const MOBILE_LANDSCAPE_MAX_WIDTH = 1024;
const MOBILE_LANDSCAPE_MAX_HEIGHT = 600;

/**
 * Uses the compact layout for narrow windows, plus phone-sized landscape
 * viewports only when the device also exposes touch input.
 *
 * Height alone is intentionally insufficient: common PC resolutions such as
 * 1280x720 must keep the desktop dashboard.
 */
export function shouldUseMobileLayout({
  width,
  height,
  hasTouchInput,
}: MobileLayoutInput): boolean {
  if (width <= MOBILE_PORTRAIT_MAX_WIDTH) {
    return true;
  }

  return (
    hasTouchInput
    && width <= MOBILE_LANDSCAPE_MAX_WIDTH
    && height <= MOBILE_LANDSCAPE_MAX_HEIGHT
  );
}

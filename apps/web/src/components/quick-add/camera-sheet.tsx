'use client';

import { AlertCircle, Camera, Keyboard, Loader2, ScanBarcode, ShieldQuestion } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { logMeal } from '@/app/actions/logs';
import { setPhotoRecognition } from '@/app/actions/preferences';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import {
  MEAL_TYPES,
  type FoodSearchResult,
  type LogOutcome,
  type MealType,
  type PhotoCandidate,
} from '@tmh/shared';

/**
 * Camera logging.
 *
 * Two paths, deliberately ordered:
 *
 *   1. Barcode — decoded on-device, frame by frame. No image is created and
 *      nothing but the number ever leaves. For a packaged product this is also
 *      *more accurate* than recognition, because it resolves to an exact entry.
 *   2. Photo — only for unpackaged food, only when the deployment has a
 *      provider configured and the user has opted in.
 *
 * Neither path logs anything on its own. Recognition guesses, and a guess must
 * never write itself into a health record.
 */

type Mode = 'scanning' | 'thinking' | 'review' | 'manual' | 'consent' | 'error';

const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'] as const;

/** Long edge to downscale to before upload — plenty for recognition. */
const MAX_EDGE = 900;
const JPEG_QUALITY = 0.72;

interface ReviewItem {
  key: string;
  name: string;
  grams: number;
  nutritionPer100g: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    sugarG: number;
    sodiumMg: number;
  };
  source: 'usda' | 'open_food_facts' | 'estimated';
  confidence?: 'high' | 'medium' | 'low';
  matchedName?: string;
  include: boolean;
}

function defaultMealType(): MealType {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

function candidateToReview(candidate: PhotoCandidate, index: number): ReviewItem {
  const factor = candidate.portionGrams > 0 ? 100 / candidate.portionGrams : 0;
  return {
    key: `photo-${index}`,
    name: candidate.name,
    grams: Math.round(candidate.portionGrams),
    nutritionPer100g: {
      calories: candidate.nutrition.calories * factor,
      proteinG: candidate.nutrition.proteinG * factor,
      carbsG: candidate.nutrition.carbsG * factor,
      fatG: candidate.nutrition.fatG * factor,
      fiberG: candidate.nutrition.fiberG * factor,
      sugarG: candidate.nutrition.sugarG * factor,
      sodiumMg: candidate.nutrition.sodiumMg * factor,
    },
    source: candidate.nutritionSource,
    confidence: candidate.confidence,
    ...(candidate.matchedName ? { matchedName: candidate.matchedName } : {}),
    include: true,
  };
}

function productToReview(product: FoodSearchResult): ReviewItem {
  return {
    key: `barcode-${product.id}`,
    name: product.brand ? `${product.name} (${product.brand})` : product.name,
    grams: product.serving?.grams ?? 100,
    nutritionPer100g: product.nutrition,
    source: product.source,
    include: true,
  };
}

export function CameraSheet({
  open,
  onClose,
  onLogged,
  photoRecognitionAvailable,
  photoRecognitionEnabled,
}: {
  open: boolean;
  onClose: () => void;
  onLogged: (outcome: LogOutcome) => void;
  /** The deployment has a provider key configured. */
  photoRecognitionAvailable: boolean;
  /** This user has opted in. */
  photoRecognitionEnabled: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectorRef = useRef<{
    detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
  } | null>(null);

  const [mode, setMode] = useState<Mode>('scanning');
  const [message, setMessage] = useState<string | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [manualCode, setManualCode] = useState('');
  const [saving, setSaving] = useState(false);

  const stopCamera = useCallback(() => {
    if (scanTimer.current) {
      clearInterval(scanTimer.current);
      scanTimer.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const lookupBarcodeValue = useCallback(
    async (code: string) => {
      stopCamera();
      setMode('thinking');
      setMessage(`Looking up ${code}…`);
      try {
        const response = await fetch(`/api/food/search?barcode=${encodeURIComponent(code)}`);
        const data = (await response.json()) as { results?: FoodSearchResult[] };
        const product = data.results?.[0];
        if (!product) {
          setMode('error');
          setMessage(
            `No product found for ${code}. It may not be in Open Food Facts — you can add it by hand instead.`,
          );
          return;
        }
        setItems([productToReview(product)]);
        setMode('review');
        setMessage(null);
      } catch {
        setMode('error');
        setMessage('Could not reach the food database. Check your connection.');
      }
    },
    [stopCamera],
  );

  /**
   * Start the camera and scan frames for a barcode.
   *
   * Deliberately sets no state before its first await: this runs from an
   * effect on mount, and a synchronous setState there causes a cascading
   * render. A fresh mount already begins in 'scanning'; the restart buttons
   * reset the mode themselves, which is a user event and therefore fine.
   */
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch (error) {
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      setMode('manual');
      setMessage(
        denied
          ? 'Camera access was blocked. Allow it in your browser settings, or type the barcode below.'
          : 'No camera available on this device. You can type a barcode instead.',
      );
      return;
    }

    // Native where available; ZXing wasm elsewhere (notably iOS Safari), loaded
    // lazily so browsers that do not need it never download it.
    try {
      if (!detectorRef.current) {
        const Native = (globalThis as { BarcodeDetector?: new (options: unknown) => never })
          .BarcodeDetector;
        if (Native) {
          detectorRef.current = new Native({ formats: BARCODE_FORMATS }) as never;
        } else {
          const { BarcodeDetector } = await import('barcode-detector/pure');
          detectorRef.current = new BarcodeDetector({
            formats: [...BARCODE_FORMATS],
          }) as unknown as typeof detectorRef.current;
        }
      }
    } catch {
      // Scanning unavailable; the photo and manual paths still work.
      return;
    }

    scanTimer.current = setInterval(async () => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || video.readyState < 2) return;
      try {
        const found = await detector.detect(video);
        const code = found[0]?.rawValue?.trim();
        if (code) void lookupBarcodeValue(code);
      } catch {
        /* a frame failed to decode; the next one will try again */
      }
    }, 350);
  }, [lookupBarcodeValue]);

  /** Reset to a clean scanning state. Only ever called from a user event. */
  const restart = useCallback(() => {
    setMode('scanning');
    setMessage(null);
    setItems([]);
    void startCamera();
  }, [startCamera]);

  // Mounted only while open (see QuickAddBar), so state starts clean every
  // time and the camera is released on unmount. The start is deferred to a
  // microtask: acquiring a camera is not something to do during commit, and
  // it keeps every state update out of the effect body.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void startCamera();
    });
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  /** Capture the current frame, downscale it, and send it for recognition. */
  const identifyPhoto = async () => {
    const video = videoRef.current;
    if (!video) return;

    if (!photoRecognitionEnabled) {
      stopCamera();
      setMode('consent');
      return;
    }

    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

    stopCamera();
    setMode('thinking');
    setMessage('Identifying what’s in the photo…');

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const imageBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1);

    try {
      const response = await fetch('/api/food/recognise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg' }),
      });
      const data = (await response.json()) as {
        candidates?: PhotoCandidate[];
        unableToIdentify?: boolean;
        error?: string;
      };

      if (!response.ok) {
        setMode('error');
        setMessage(data.error ?? 'Could not read that photo.');
        return;
      }
      if (data.unableToIdentify || !data.candidates?.length) {
        setMode('error');
        setMessage('No food recognised in that photo. Try a clearer shot, or search by name.');
        return;
      }

      setItems(data.candidates.map(candidateToReview));
      setMode('review');
      setMessage(null);
    } catch {
      setMode('error');
      setMessage('Could not reach the recognition service.');
    }
  };

  const logItems = async () => {
    const chosen = items.filter((item) => item.include);
    if (chosen.length === 0) return;

    setSaving(true);
    let last: LogOutcome | null = null;

    for (const item of chosen) {
      const factor = item.grams / 100;
      last = await logMeal({
        mealType,
        name: item.name,
        foodSource: item.source === 'estimated' ? 'custom' : item.source,
        quantity: item.grams,
        unit: 'g',
        calories: Math.round(item.nutritionPer100g.calories * factor),
        proteinG: item.nutritionPer100g.proteinG * factor,
        carbsG: item.nutritionPer100g.carbsG * factor,
        fatG: item.nutritionPer100g.fatG * factor,
        fiberG: item.nutritionPer100g.fiberG * factor,
        sugarG: item.nutritionPer100g.sugarG * factor,
        sodiumMg: item.nutritionPer100g.sodiumMg * factor,
      });
      if (!last.ok) break;
    }

    setSaving(false);
    if (last) {
      onLogged(
        last.ok && chosen.length > 1
          ? { ...last, summary: `Logged ${chosen.length} items to ${mealType}.` }
          : last,
      );
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Scan or photograph food"
      description={
        mode === 'scanning'
          ? 'Point at a barcode — it scans automatically.'
          : mode === 'review'
            ? 'Check these before they go in your log.'
            : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {(mode === 'scanning' || mode === 'thinking') && (
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              aria-label="Camera preview"
              className="aspect-[4/3] w-full object-cover"
            />
            {mode === 'scanning' && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-primary/70"
              />
            )}
            {mode === 'thinking' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70">
                <Loader2 aria-hidden className="size-6 animate-spin text-white" />
                <p className="text-sm text-white">{message}</p>
              </div>
            )}
          </div>
        )}

        {mode === 'scanning' && (
          <>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ScanBarcode aria-hidden className="size-3.5 shrink-0" />
              Barcodes are read on your device — only the number is sent.
            </p>

            <div className="flex gap-2">
              {photoRecognitionAvailable && (
                <Button type="button" onClick={identifyPhoto} className="flex-1">
                  <Camera aria-hidden />
                  Identify by photo
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  stopCamera();
                  setMode('manual');
                  setMessage(null);
                }}
                className={photoRecognitionAvailable ? '' : 'flex-1'}
              >
                <Keyboard aria-hidden />
                Type it
              </Button>
            </div>
          </>
        )}

        {mode === 'consent' && (
          <div className="rounded-xl border border-border p-4">
            <ShieldQuestion aria-hidden className="size-5 text-primary" />
            <h3 className="mt-2 font-medium tracking-tight">Send the photo for identification?</h3>
            <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <p>
                Everything else in this app keeps your data here — food lookups send only a search
                term. Identifying a photo is different: the image is sent to Google&rsquo;s Gemini
                API to work out what the food is.
              </p>
              <p>
                The photo isn&rsquo;t saved anywhere by us — not in the database, not on disk. Only
                the resulting food names and portions are, once you confirm them.
              </p>
              <p>You can turn this back off at any time in Settings.</p>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <form
                action={setPhotoRecognition}
                className="flex-1"
                onSubmit={() => setTimeout(restart, 400)}
              >
                <input type="hidden" name="enabled" value="true" />
                <Button type="submit" className="w-full">
                  Turn on photo identification
                </Button>
              </form>
              <Button type="button" variant="outline" onClick={restart}>
                Keep scanning barcodes
              </Button>
            </div>
          </div>
        )}

        {mode === 'manual' && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const code = manualCode.replace(/\D/g, '');
              if (code.length >= 6) void lookupBarcodeValue(code);
            }}
          >
            {message && (
              <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
                {message}
              </p>
            )}
            <div>
              <Label htmlFor="manual-barcode">Barcode number</Label>
              <Input
                id="manual-barcode"
                inputMode="numeric"
                autoComplete="off"
                placeholder="3017620422003"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                className="mt-1.5 font-mono"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={manualCode.replace(/\D/g, '').length < 6}>
                Look up
              </Button>
              <Button type="button" variant="ghost" onClick={restart}>
                Use the camera
              </Button>
            </div>
          </form>
        )}

        {mode === 'error' && (
          <div className="flex flex-col gap-3">
            <p role="alert" className="flex items-start gap-2 text-sm leading-relaxed">
              <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
              {message}
            </p>
            <div className="flex gap-2">
              <Button type="button" onClick={restart}>
                Try again
              </Button>
              <Button type="button" variant="ghost" onClick={() => setMode('manual')}>
                Type a barcode
              </Button>
            </div>
          </div>
        )}

        {mode === 'review' && (
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="camera-meal">Meal</Label>
              <Select
                id="camera-meal"
                value={mealType}
                onChange={(event) => setMealType(event.target.value as MealType)}
                className="mt-1.5"
              >
                {MEAL_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </Select>
            </div>

            <ul className="flex flex-col gap-2">
              {items.map((item, index) => {
                const kcal = Math.round((item.nutritionPer100g.calories * item.grams) / 100);
                return (
                  <li key={item.key} className="rounded-lg border border-border p-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={item.include}
                        aria-label={`Include ${item.name}`}
                        onChange={(event) =>
                          setItems((current) =>
                            current.map((entry, i) =>
                              i === index ? { ...entry, include: event.target.checked } : entry,
                            ),
                          )
                        }
                        className="mt-1 size-4 shrink-0 accent-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <input
                          value={item.name}
                          aria-label="Food name"
                          onChange={(event) =>
                            setItems((current) =>
                              current.map((entry, i) =>
                                i === index ? { ...entry, name: event.target.value } : entry,
                              ),
                            )
                          }
                          className="w-full bg-transparent text-sm font-medium outline-none"
                        />
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {kcal} kcal ·{' '}
                          {item.source === 'estimated' ? (
                            <span className="text-warning">estimated nutrition</span>
                          ) : (
                            <span>
                              {item.source === 'usda' ? 'USDA' : 'Open Food Facts'}
                              {item.matchedName ? ` · ${item.matchedName}` : ''}
                            </span>
                          )}
                          {item.confidence ? ` · ${item.confidence} confidence` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={5000}
                          aria-label={`Grams of ${item.name}`}
                          value={item.grams}
                          onChange={(event) =>
                            setItems((current) =>
                              current.map((entry, i) =>
                                i === index
                                  ? { ...entry, grams: Math.max(1, Number(event.target.value)) }
                                  : entry,
                              ),
                            )
                          }
                          className="h-8 w-20 text-right"
                        />
                        <span className="text-xs text-muted-foreground">g</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Portions are estimates. Adjust anything that looks wrong before logging — these
              numbers go straight into your day.
            </p>

            <div className="flex gap-2">
              <Button
                type="button"
                size="lg"
                className="flex-1"
                disabled={saving || items.every((item) => !item.include)}
                onClick={() => void logItems()}
              >
                {saving && <Loader2 aria-hidden className="animate-spin" />}
                Log {items.filter((item) => item.include).length} item
                {items.filter((item) => item.include).length === 1 ? '' : 's'}
              </Button>
              <Button type="button" variant="ghost" size="lg" onClick={restart}>
                Retake
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

"use client";

import Image from "next/image";
import { useState } from "react";

type VehicleImage = { id: string; url: string | null; file_name: string | null; sort_order: number };

export default function ImageGallery({ images, alt }: { images: VehicleImage[]; alt: string }) {
  const [mainImage, setMainImage] = useState(0);

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="relative aspect-[4/3] glass-card overflow-hidden flex items-center justify-center bg-surface-hover">
        {images[mainImage]?.url ? (
          <Image
            src={images[mainImage].url}
            alt={alt}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
            priority
          />
        ) : (
          <div className="text-muted text-sm">写真なし</div>
        )}
      </div>
      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {images.map((img, idx) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setMainImage(idx)}
              className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                idx === mainImage ? "border-accent" : "border-transparent"
              }`}
            >
              {img.url && <Image src={img.url} alt="" width={64} height={64} className="w-full h-full object-cover" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

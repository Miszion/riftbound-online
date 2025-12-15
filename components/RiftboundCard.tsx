'use client'

import Image from 'next/image'

interface RiftboundCardProps {
  title: string
  cardType: 'champion' | 'spell' | 'rune'
  imageSrc: string
  power?: number
  health?: number
}

export default function RiftboundCard({
  title,
  cardType,
  imageSrc,
  power,
  health,
}: RiftboundCardProps) {
  return (
    <div className={`riftbound-card card-${cardType}`}>
      <div className="card-image-container">
        <Image
          src={imageSrc}
          alt={title}
          width={160}
          height={220}
          className="card-image"
          priority
        />
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import RiftboundCard from '@/components/RiftboundCard'

export default function Home() {
  return (
    <>
      <Header />
      <main className="home-main">
        <section className="hero">
          <div className="home-container hero-inner">
            <div className="hero-text">
              <h2>Take command of the rift</h2>
              <p>
                Riftbound Online is a fan-built landing page inspired by the
                Riftbound card game from League of Legends. Discover decks,
                collect champions, and clash on the rift.
              </p>
              <p className="muted">
                This is a demo homepage and sign-in mockup — not an official
                Riot Games product.
              </p>
              <p>
                <Link href="/sign-in" className="cta">
                  Get started — Sign in
                </Link>
                <Link href="/deckbuilder" className="btn secondary">
                  Open Deckbuilder
                </Link>
                <Link href="/matchmaking" className="btn secondary">
                  Queue for a Match
                </Link>
                <Link href="/spectate" className="btn secondary">
                  Watch Matches
                </Link>
              </p>
            </div>
            <div className="hero-art">
              <div className="card-showcase">
                <div className="card-tier top-tier">
                  <RiftboundCard title="Falling Star" cardType="spell" imageSrc="/images/falling-star.jpg" />
                </div>
                <div className="card-tier bottom-tier">
                  <RiftboundCard title="Viktor" cardType="champion" imageSrc="/images/viktor.jpg" />
                  <RiftboundCard title="Mind Rune" cardType="rune" imageSrc="/images/mind-rune.jpg" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="features home-container">
          <h3>Features</h3>
          <div className="grid">
            <div className="feature">
              <h4>Deck building</h4>
              <p>
                Create custom decks by blending champion synergies and spells
                to outplay your opponent.
              </p>
            </div>
            <div className="feature">
              <h4>Ranked play</h4>
              <p>Test your skill in ranked matches and climb the ladder.</p>
            </div>
            <div className="feature">
              <h4>Collect & craft</h4>
              <p>
                Collect cards, craft new ones, and evolve your favorite
                champions.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

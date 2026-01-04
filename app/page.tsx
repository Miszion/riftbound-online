'use client'

import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div className="container hero-inner">
            <div className="hero-text">
              <h2>Take command of the rift</h2>
              <p>
                Riftbound Online is a fan-built landing page inspired by the Riftbound card game from League of
                Legends. Discover decks, collect champions, and clash on the rift.
              </p>
              <p className="muted">
                This is a demo homepage and sign-in mockup — not an official Riot Games product.
              </p>
              <p>
                <Link className="cta" href="/sign-in">
                  Get started — Sign in
                </Link>
              </p>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="card-slab">
                <div className="card">
                  <div className="card-image-wrapper">
                    <Image
                      src="/images/viktor.jpg"
                      alt="Viktor champion card art"
                      fill
                      sizes="(max-width: 800px) 120px, 160px"
                      priority
                    />
                  </div>
                </div>
                <div className="card alt">
                  <div className="card-image-wrapper">
                    <Image
                      src="/images/falling-star.jpg"
                      alt="Falling Star spell art"
                      fill
                      sizes="(max-width: 800px) 110px, 140px"
                    />
                  </div>
                </div>
                <div className="card alt2">
                  <div className="card-image-wrapper">
                    <Image
                      src="/images/mind-rune.jpg"
                      alt="Mind rune card art"
                      fill
                      sizes="(max-width: 800px) 95px, 120px"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="features container">
          <h3>Features</h3>
          <div className="grid">
            <div className="feature">
              <h4>Deck building</h4>
              <p>Create custom decks by blending champion synergies and spells to outplay your opponent.</p>
            </div>
            <div className="feature">
              <h4>Ranked play</h4>
              <p>Test your skill in ranked matches and climb the ladder.</p>
            </div>
            <div className="feature">
              <h4>Collect & craft</h4>
              <p>Collect cards, craft new ones, and evolve your favorite champions.</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

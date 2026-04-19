/* eslint-disable react/prop-types */
import React from 'react'
import { BookOpen, Scale, ShieldCheck, ExternalLink } from 'lucide-react'

export default function AboutPage({ onNavigateHome }) {
  return (
    <div className="min-h-screen overflow-y-auto bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-950">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button
            onClick={onNavigateHome}
            className="flex items-center gap-2 text-cyan-400 transition-colors hover:text-cyan-300"
          >
            <BookOpen size={18} />
            <span className="font-mono text-sm font-bold tracking-wider">
              Ansible<sup className="text-[8px] align-super">®</sup><span className="text-white">101</span>
            </span>
          </button>
          <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-slate-400">
            About / Legal
          </span>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <section className="max-w-3xl">
          <div className="mb-3 flex items-center gap-3 text-cyan-400">
            <Scale size={18} />
            <h1 className="font-mono text-2xl font-bold tracking-tight text-white">
              Independent Ansible® Learning Tool
            </h1>
          </div>
          <p className="text-sm leading-7 text-slate-300">
            Ansible101 is an independent, browser-based site for tutorials, reviews,
            visual explanations, debugging walkthroughs, and safe experimentation with
            Ansible playbooks and Jinja expressions. The project is intended to help
            learners and practitioners understand automation logic more quickly by
            turning YAML into visual flows and plain-English explanations.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <InfoCard
            icon={BookOpen}
            title="Purpose"
            body="Tutorials, reviews, playbook breakdowns, and hands-on exploration of Ansible logic without needing a remote host or a running control node."
          />
          <InfoCard
            icon={ShieldCheck}
            title="Independence"
            body="This site is community-built and is not an official documentation portal, support channel, training product, or certification service."
          />
          <InfoCard
            icon={Scale}
            title="Trademark Notice"
            body="Ansible101 is not affiliated with, endorsed by, or sponsored by Red Hat, Inc. Ansible® is a trademark of Red Hat, LLC, registered in the United States and other countries."
          />
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="mb-3 font-mono text-sm font-semibold uppercase tracking-widest text-cyan-400">
            Legal Summary
          </h2>
          <div className="space-y-3 text-sm leading-7 text-slate-300">
            <p>
              Ansible101 exists to provide independent commentary, education, review,
              and experimentation tooling around Ansible concepts. References to
              Ansible modules, playbooks, terminology, or trademarks are used solely
              to describe compatibility, explain workflows, and support learning.
            </p>
            <p>
              Nothing on this site should be interpreted as official Red Hat guidance,
              product support, certification material, or vendor-authorized training.
              Users should refer to official vendor documentation for authoritative
              product behavior, licensing, support terms, and trademark policy.
            </p>
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="font-mono">Need official docs?</span>
          <a
            href="https://docs.ansible.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded border border-slate-700 px-3 py-1.5 font-mono text-cyan-400 transition-colors hover:border-cyan-700 hover:text-cyan-300"
          >
            docs.ansible.com
            <ExternalLink size={12} />
          </a>
        </section>
      </main>
    </div>
  )
}

function InfoCard({ icon: Icon, title, body }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-3 flex items-center gap-2 text-cyan-400">
        <Icon size={16} />
        <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-white">
          {title}
        </h2>
      </div>
      <p className="text-sm leading-6 text-slate-300">{body}</p>
    </article>
  )
}

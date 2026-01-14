'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import { Badge, StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function DesignSystemPage() {
    const [selectValue, setSelectValue] = useState('');
    const [modalOpen, setModalOpen] = useState(false);

    return (
        <div className="min-h-screen bg-[var(--bg-primary)]">
            {/* Header */}
            <header className="border-b border-[var(--border-primary)]">
                <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Image
                            src="/app-icon.png"
                            alt="Olly Molly"
                            width={32}
                            height={32}
                            className="opacity-80"
                        />
                        <div>
                            <h1 className="text-sm font-medium text-[var(--text-primary)]">Design System</h1>
                            <p className="text-xs text-[var(--text-muted)]">Olly Molly</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link href="/" className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                            ← Back
                        </Link>
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-6 py-12">
                {/* Intro */}
                <div className="mb-16">
                    <h1 className="text-display text-[var(--text-primary)] mb-4">Design System</h1>
                    <p className="text-body text-[var(--text-secondary)] max-w-lg">
                        Minimal design inspired by fontshare.com. Cream backgrounds, black text, thin borders.
                    </p>
                </div>

                {/* Colors */}
                <section className="mb-16">
                    <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] mb-6">Colors</h2>
                    <div className="border-t border-[var(--border-primary)]">
                        <ColorRow name="bg-primary" value="#F5F4EE" />
                        <ColorRow name="bg-secondary" value="#EFEDE5" />
                        <ColorRow name="bg-card" value="#FAFAF7" />
                        <ColorRow name="border-primary" value="#E0DED6" />
                        <ColorRow name="text-primary" value="#1A1A1A" isText />
                        <ColorRow name="text-secondary" value="#4A4A4A" isText />
                        <ColorRow name="text-muted" value="#9A9A9A" isText />
                    </div>
                </section>

                {/* Typography */}
                <section className="mb-16">
                    <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] mb-6">Typography</h2>
                    <div className="border-t border-[var(--border-primary)] divide-y divide-[var(--border-primary)]">
                        <div className="py-4 flex items-baseline justify-between">
                            <span className="text-display text-[var(--text-primary)]">Display</span>
                            <span className="text-xs text-[var(--text-muted)]">2.5rem / 500</span>
                        </div>
                        <div className="py-4 flex items-baseline justify-between">
                            <span className="text-heading-1 text-[var(--text-primary)]">Heading 1</span>
                            <span className="text-xs text-[var(--text-muted)]">1.75rem / 500</span>
                        </div>
                        <div className="py-4 flex items-baseline justify-between">
                            <span className="text-heading-2 text-[var(--text-primary)]">Heading 2</span>
                            <span className="text-xs text-[var(--text-muted)]">1.25rem / 500</span>
                        </div>
                        <div className="py-4 flex items-baseline justify-between">
                            <span className="text-body text-[var(--text-primary)]">Body Text</span>
                            <span className="text-xs text-[var(--text-muted)]">0.875rem</span>
                        </div>
                        <div className="py-4 flex items-baseline justify-between">
                            <span className="text-caption text-[var(--text-muted)]">CAPTION TEXT</span>
                            <span className="text-xs text-[var(--text-muted)]">0.75rem</span>
                        </div>
                    </div>
                </section>

                {/* Buttons */}
                <section className="mb-16">
                    <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] mb-6">Buttons</h2>
                    <div className="border-t border-[var(--border-primary)] py-6">
                        <div className="flex flex-wrap items-center gap-4 mb-6">
                            <Button variant="primary">Primary</Button>
                            <Button variant="secondary">Secondary</Button>
                            <Button variant="ghost">Ghost</Button>
                            <Button variant="danger">Danger</Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                            <Button size="sm">Small</Button>
                            <Button size="md">Medium</Button>
                            <Button size="lg">Large</Button>
                            <Button disabled>Disabled</Button>
                        </div>
                    </div>
                </section>

                {/* Badges */}
                <section className="mb-16">
                    <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] mb-6">Badges</h2>
                    <div className="border-t border-[var(--border-primary)] py-6">
                        <div className="flex flex-wrap gap-3 mb-4">
                            <Badge>Default</Badge>
                            <Badge variant="success">Success</Badge>
                            <Badge variant="warning">Warning</Badge>
                            <Badge variant="danger">Danger</Badge>
                            <Badge variant="info">Info</Badge>
                        </div>
                        <div className="flex flex-wrap gap-3 mb-4">
                            <StatusBadge status="TODO" />
                            <StatusBadge status="IN_PROGRESS" />
                            <StatusBadge status="IN_REVIEW" />
                            <StatusBadge status="COMPLETE" />
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <PriorityBadge priority="LOW" />
                            <PriorityBadge priority="MEDIUM" />
                            <PriorityBadge priority="HIGH" />
                            <PriorityBadge priority="CRITICAL" />
                        </div>
                    </div>
                </section>

                {/* Cards */}
                <section className="mb-16">
                    <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] mb-6">Cards</h2>
                    <div className="border border-[var(--border-primary)]">
                        <Card variant="bordered">
                            <CardHeader>
                                <h3 className="text-sm font-medium text-[var(--text-primary)]">Card Title</h3>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-[var(--text-secondary)]">
                                    Minimal card with thin borders and no shadows.
                                </p>
                            </CardContent>
                            <CardFooter>
                                <div className="flex justify-end gap-3">
                                    <Button variant="ghost" size="sm">Cancel</Button>
                                    <Button size="sm">Save</Button>
                                </div>
                            </CardFooter>
                        </Card>
                    </div>
                </section>

                {/* Form Elements */}
                <section className="mb-16">
                    <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] mb-6">Form Elements</h2>
                    <div className="border-t border-[var(--border-primary)] py-6 space-y-6 max-w-md">
                        <Input label="Input" placeholder="Enter text..." />
                        <Input label="With Error" placeholder="Enter text..." error="This field has an error" />
                        <Select
                            label="Select"
                            value={selectValue}
                            onChange={setSelectValue}
                            placeholder="Choose option..."
                            options={[
                                { value: '1', label: 'Option 1' },
                                { value: '2', label: 'Option 2' },
                            ]}
                        />
                        <Textarea label="Textarea" placeholder="Write here..." rows={3} />
                    </div>
                </section>

                {/* Avatars */}
                <section className="mb-16">
                    <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] mb-6">Avatars</h2>
                    <div className="border-t border-[var(--border-primary)] py-6">
                        <div className="flex items-end gap-6">
                            <Avatar name="John Doe" size="sm" />
                            <Avatar name="Jane Smith" size="md" />
                            <Avatar name="Bob Wilson" size="lg" />
                            <Avatar name="PM" emoji="👔" size="md" />
                        </div>
                    </div>
                </section>

                {/* Modal */}
                <section className="mb-16">
                    <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] mb-6">Modal</h2>
                    <div className="border-t border-[var(--border-primary)] py-6">
                        <Button onClick={() => setModalOpen(true)}>Open Modal</Button>
                    </div>
                </section>
            </main>

            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Modal Title">
                <p className="text-sm text-[var(--text-secondary)] mb-6">
                    Minimal modal dialog with thin borders.
                </p>
                <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
                    <Button onClick={() => setModalOpen(false)}>Confirm</Button>
                </div>
            </Modal>

            {/* Footer */}
            <footer className="border-t border-[var(--border-primary)] py-8">
                <p className="text-center text-xs text-[var(--text-muted)]">
                    Olly Molly Design System
                </p>
            </footer>
        </div>
    );
}

function ColorRow({ name, value, isText = false }: { name: string; value: string; isText?: boolean }) {
    return (
        <div className="flex items-center justify-between py-3 border-b border-[var(--border-primary)]">
            <div className="flex items-center gap-4">
                <div
                    className={`w-8 h-8 border border-[var(--border-primary)] ${isText ? 'flex items-center justify-center bg-[var(--bg-card)]' : ''}`}
                    style={{ backgroundColor: isText ? undefined : value }}
                >
                    {isText && <span style={{ color: value }} className="text-sm font-medium">A</span>}
                </div>
                <span className="text-sm text-[var(--text-primary)]">{name}</span>
            </div>
            <span className="text-xs text-[var(--text-muted)] font-mono">{value}</span>
        </div>
    );
}

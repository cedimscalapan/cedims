<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { profile } from '$lib/utils/auth';
    let menuOpen = $state(false);
    const roles = [
        { name: 'Teacher', uploads: 'Daily Lesson Plan', scope: 'Personal submissions', details: 'Submit Daily Lesson Plans against a teaching load, check weekly compliance, and read reviewer remarks in Archives.' },
        { name: 'Master Teacher', uploads: 'Daily Lesson Plan, ISP, ISR', scope: 'Own submissions and school Daily Lesson Plans', details: 'Submit teaching and supervisory documents. Monitor school submissions and leave remarks on Daily Lesson Plans from your school.' },
        { name: 'School Head', uploads: 'ISP, ISR', scope: 'School monitoring', details: 'Monitor your staff’s submissions, review school Daily Lesson Plans and Master Teacher ISP/ISR documents, and submit your own plans and reports.' },
        { name: 'District Supervisor', uploads: 'Review only', scope: 'District monitoring and administration', details: 'Compare schools, review district submissions and ISP/ISR documents, view analytics, and administer accounts and system settings.' }
    ];
    const schools = ['Bulusan', 'Guinobatan', 'Ibaba', 'Salong', 'Suqui'];
    const steps = [
        ['Prepare your submission', 'Teachers and Master Teachers select a teaching load for Daily Lesson Plans. School Heads and Master Teachers may also submit ISP/ISR documents.'],
        ['Upload and confirm', 'Upload a supported file, review the extracted document information, and confirm the submission. Offline uploads wait on the device until they can sync.'],
        ['Review in Archives', 'Authorized reviewers add remarks to documents in their school or district. The archive distinguishes documents awaiting checking from those with remarks.'],
        ['Follow up on compliance', 'Check on-time, late, and missing Daily Lesson Plan submissions against calendar weeks and teaching loads. School and district views help supervisors identify where follow-up is needed.']
    ];
    onMount(() => profile.subscribe(value => { if (value) void goto('/dashboard'); }));
</script>

<svelte:head>
    <title>CEDIMS — Calapan East District Instructional Monitoring System</title>
    <meta name="description" content="Submit DLLs, review instructional documents, and monitor school and district compliance in CEDIMS." />
</svelte:head>

<div class="landing">
    <header>
        <a class="brand" href="/"><img src="/app_icon.png" alt="" width="38" height="38" /><span>CEDIMS<small>Calapan East District</small></span></a>
        <button class="menu-toggle" aria-expanded={menuOpen} aria-controls="site-nav" onclick={() => menuOpen = !menuOpen}>{menuOpen ? 'Close menu' : 'Menu'}</button>
        <nav id="site-nav" class:open={menuOpen} aria-label="Main navigation">
            <a href="#workflow" onclick={() => menuOpen = false}>How it works</a>
            <a href="#roles" onclick={() => menuOpen = false}>Your role</a>
            <a href="#schools" onclick={() => menuOpen = false}>Our schools</a>
            <a class="sign-in" href="/auth/login">Sign in <span aria-hidden="true">↗</span></a>
        </nav>
    </header>

    <main>
        <section class="hero">
            <div>
                <p class="eyebrow">Instructional monitoring / Calapan East</p>
                <h1>A clear record.<br />A shared responsibility.</h1>
                <p class="intro">Submit lesson logs, review instructional documents, and follow compliance across your school or district.</p>
                <a class="primary" href="/auth/login">Sign in to CEDIMS <span aria-hidden="true">↗</span></a>
                <p class="access-note">Use the account issued by your District Office.</p>
            </div>
            <aside class="document" aria-label="Documents supported by CEDIMS">
                <div class="document-heading"><img src="/deped-calapan-east-district.jpg" alt="Calapan East District seal" width="64" height="64" /><span>Calapan East District<br /><small>Instructional records</small></span></div>
                <p class="document-label">Documents in this workspace</p>
                <dl>
                    <div><dt>01</dt><dd>Daily Lesson Plan</dd></div>
                    <div><dt>02 / ISP</dt><dd>Instructional Supervisory Plan</dd></div>
                    <div><dt>03 / ISR</dt><dd>Instructional Supervisory Report</dd></div>
                </dl>
                <p class="document-note">Upload access and review responsibilities follow the role on your account.</p>
            </aside>
        </section>

        <section id="workflow" class="section">
            <div class="section-heading"><p class="eyebrow">01 / The workflow</p><h2>From a submitted file<br />to a reviewed record.</h2></div>
            <ol class="steps">{#each steps as step, i}<li><span class="number">0{i + 1}</span><div><h3>{step[0]}</h3><p>{step[1]}</p></div></li>{/each}</ol>
            <div class="tools"><h3>Tools for the work around it</h3><p><strong>Archives</strong> for documents and remarks. <strong>Notifications</strong> for submission activity and deadlines. <strong>QR verification</strong> for document records. <strong>Gabay</strong> for CEDIMS questions, record lookups, and compliance reports for School Heads and District Supervisors.</p></div>
        </section>

        <section id="roles" class="section">
            <div class="section-heading"><p class="eyebrow">02 / Responsibilities</p><h2>Four roles.<br />Defined access.</h2><p>Document access follows your account’s role and school or district assignment.</p></div>
            <div class="roles">{#each roles as role}<article><div class="role-title"><h3>{role.name}</h3><span>{role.uploads}</span></div><p class="scope">{role.scope}</p><p>{role.details}</p></article>{/each}</div>
        </section>

        <section id="schools" class="section schools-section">
            <div class="section-heading"><p class="eyebrow">03 / Our current scope</p><h2>Five schools.<br />One district community.</h2></div>
            <ul class="schools">{#each schools as school}<li><img src={'/school-' + school.toLowerCase() + '.jpg'} alt={school + ' Elementary School seal'} width="100" height="100" loading="lazy" /><h3>{school}<small>Elementary School</small></h3></li>{/each}</ul>
        </section>

        <section class="commitment" aria-labelledby="sdg-heading">
            <img src="/sdg-4-quality-education.svg" alt="Sustainable Development Goal 4: Quality Education" width="160" height="160" loading="lazy" />
            <div><p class="eyebrow">Our commitment / SDG 4</p><h2 id="sdg-heading">Supporting quality education.</h2><p>SDG 4 calls for inclusive and equitable quality education and lifelong learning opportunities for all. CEDIMS contributes to that aim through organized instructional records, documented feedback, and visibility into submission gaps that need attention.</p><p>These tools support teachers and supervisors in their work; submission compliance alone does not measure the quality of learning.</p></div>
        </section>

        <section class="entry"><div><h2>Continue to your workspace.</h2><p>Need an account or a change to your assigned role? Contact your District Office administrator.</p></div><a class="primary" href="/auth/login">Sign in <span aria-hidden="true">↗</span></a></section>
    </main>
    <footer><div><strong>CEDIMS</strong><p>Calapan East District Instructional Monitoring System<br />Powered by Smart E-VISION</p></div><div class="footer-links"><a href="/privacy">Privacy notice</a><a href="/terms">Terms of use</a></div></footer>
</div>

<style>
    .landing{--brand-navy:var(--color-gov-blue-dark);--brand-blue:var(--color-gov-blue);--brand-gold:var(--color-gov-gold);--brand-ink:var(--color-text-primary);--brand-muted:var(--color-text-secondary);--brand-line:var(--color-border-subtle);background:var(--color-surface);color:var(--brand-ink);font-family:var(--font-family-sans,"Segoe UI",Roboto,system-ui,sans-serif);line-height:1.65;min-height:100dvh}
    :global(.dark) .landing{--brand-navy:var(--color-text-primary);--brand-blue:var(--color-gov-blue-vibrant);--brand-gold:var(--color-gov-gold);--brand-ink:var(--color-text-primary);--brand-muted:var(--color-text-secondary);--brand-line:var(--color-border-subtle)}
    header,main,footer{max-width:1160px;margin:auto}
    header{display:flex;align-items:center;justify-content:space-between;padding:24px 28px;border-bottom:1px solid var(--brand-line)}
    .brand{display:flex;gap:12px;align-items:center;font-weight:800;font-size:20px;letter-spacing:.02em;color:var(--brand-navy)}.brand small{display:block;font-size:11px;font-weight:500;letter-spacing:.03em;color:var(--brand-muted)}.brand img{border-radius:6px}
    nav{display:flex;gap:28px;align-items:center;font-size:14px}a{text-decoration:none;color:inherit}a:hover{text-decoration:underline;text-underline-offset:5px}.sign-in{font-weight:bold}.sign-in span{margin-left:12px}.menu-toggle{display:none}
    .hero{padding:86px 28px 90px;display:grid;grid-template-columns:1.3fr 1fr;gap:80px;align-items:center}
    .eyebrow{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:var(--brand-blue);margin-bottom:22px}
    h1{font-size:clamp(42px,5vw,66px);font-weight:750;line-height:1.09;letter-spacing:-.04em;margin:0;color:var(--brand-navy)}
    .intro{font-size:18px;line-height:1.8;max-width:470px;margin:26px 0 28px;color:var(--brand-muted)}
    .primary{display:inline-flex;justify-content:space-between;align-items:center;gap:40px;background:var(--brand-blue);color:var(--color-surface-white);padding:13px 21px;font-size:14px;font-weight:700;border-radius:6px}.primary:hover{background:var(--brand-navy)}.access-note{font-size:12px;color:var(--brand-muted);margin-top:12px}
    .document{background:var(--color-surface-white);border:1px solid var(--brand-line);padding:30px;box-shadow:var(--shadow-md)}.document-heading{display:flex;align-items:center;gap:18px;font-size:15px;font-weight:700}.document-heading small{font-size:12px;font-weight:400;color:var(--brand-muted)}.document-heading img{object-fit:contain;border-radius:50%}.document-label{margin-top:32px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--brand-muted)}dl{margin-top:12px}dl div{border-top:1px solid var(--brand-line);padding:16px 0;display:flex;gap:16px;align-items:baseline}dt{font-size:11px;min-width:66px;color:var(--brand-muted)}dd{font-size:14px;font-weight:700}.document-note{border-top:1px solid var(--brand-line);padding-top:18px;font-size:12px;color:var(--brand-muted)}
    .section{padding:68px 28px;border-top:1px solid var(--brand-line);scroll-margin-top:20px}.section-heading{max-width:610px;margin-bottom:36px}h2{font-weight:700;font-size:clamp(30px,3.5vw,42px);line-height:1.15;letter-spacing:-.025em;color:var(--brand-navy)}h3{font-size:17px;font-weight:700}.section-heading>p:last-child{margin-top:18px;color:var(--brand-muted)}.steps{list-style:none;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:32px 50px}.steps li{display:flex;gap:20px}.number{color:var(--brand-gold);font-size:26px;font-weight:800}.steps p,.roles p{font-size:14px;color:var(--brand-muted);margin-top:9px;line-height:1.85}.tools{margin-top:42px;padding:24px 0;border-top:1px solid var(--brand-line);display:grid;grid-template-columns:1fr 2fr;gap:32px}.tools p{font-size:14px;color:var(--brand-muted)}
    .roles{display:grid;grid-template-columns:1fr 1fr;gap:0 50px}.roles article{border-top:1px solid var(--brand-line);padding:26px 0}.role-title{display:flex;align-items:center;justify-content:space-between;gap:12px}.role-title span{font-size:10px;border:1px solid var(--color-border-strong);border-radius:3px;padding:3px 7px;white-space:nowrap}.roles .scope{font-size:12px;color:var(--color-gov-green-dark);font-weight:bold}
    .schools{list-style:none;padding:0;display:grid;grid-template-columns:repeat(5,1fr);gap:20px}.schools li{text-align:center}.schools img{object-fit:contain;margin:0 auto 20px;border-radius:50%;background:var(--color-surface-white)}.schools h3{font-size:15px}.schools small{display:block;font-size:11px;font-weight:400;color:var(--brand-muted)}
    .commitment{margin:0 28px;padding:38px;background:color-mix(in srgb,var(--color-gov-blue) 8%,var(--color-surface-white));border:1px solid var(--brand-line);display:grid;grid-template-columns:160px 1fr;gap:42px;align-items:start}.commitment img{width:100%;height:auto}.commitment p:not(.eyebrow){font-size:14px;line-height:1.85;margin-top:16px;color:var(--brand-muted)}.commitment h2{font-size:32px}
    .entry{padding:65px 28px;display:flex;align-items:center;justify-content:space-between;gap:32px}.entry h2{font-size:30px}.entry p{font-size:13px;max-width:600px;color:var(--brand-muted);margin-top:12px}.entry .primary{flex-shrink:0}footer{border-top:1px solid var(--brand-line);padding:28px 28px 85px;display:flex;justify-content:space-between;gap:20px;font-size:12px}footer p{color:var(--brand-muted);margin-top:8px}.footer-links{display:flex;gap:24px;align-items:start}
    @media(max-width:760px){header{flex-wrap:wrap;padding:18px 22px}.menu-toggle{display:block;border:1px solid var(--color-border-strong);background:var(--color-surface-white);color:var(--brand-ink);padding:7px 12px;border-radius:3px;font-size:13px}nav{display:none;width:100%;padding-top:20px;flex-wrap:wrap;gap:18px}nav.open{display:flex}.hero{grid-template-columns:1fr;gap:35px;padding:48px 22px}.document{max-width:480px;padding:24px}.section{padding:44px 22px}.steps,.roles{grid-template-columns:1fr;gap:24px}.roles{gap:0}.tools{grid-template-columns:1fr;gap:14px}.schools{grid-template-columns:repeat(2,1fr);gap:28px}.schools li:last-child{grid-column:1/-1}.commitment{margin:0 22px;padding:25px;grid-template-columns:1fr;gap:22px}.commitment img{width:110px}.entry{padding:44px 22px;align-items:start;flex-direction:column}footer{padding:24px 22px 90px;flex-direction:column}.footer-links{margin-top:10px}}
</style>

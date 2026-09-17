<script lang="ts">
	import { page } from "$app/stores";
	import { profile } from "$lib/utils/auth";
	import { getNavItemsForRole } from "$lib/config/navigation";

	// Filter items by current role (shared source of truth with
	// AppHeader.svelte, via config/navigation.ts).
	const filteredItems = $derived(getNavItemsForRole($profile?.role));

	// Only the items marked for the tab bar — it holds fewer than the top
	// bar's nav at lg+, which lists every item the role can reach.
	const mobileNavItems = $derived(filteredItems.filter((item) => item.mobileNav));

	function isActive(href: string): boolean {
		const currentPath = $page.url.pathname;
		if (href === "/dashboard") return currentPath === "/dashboard";
		return currentPath.startsWith(href);
	}
</script>

<!-- No component-local <style> block: .mobile-nav-bar/.mobile-nav-item/
     .mobile-nav-icon are all defined once in app.css. This block used to
     redefine every one of them a third time (app.css itself had a
     duplicate until Phase 0) via :global(), competing with the canonical
     version on load order. .cedims-scroll wasn't even used in this
     component's template. -->

<!-- Bottom Tab Bar — the nav surface below lg. At lg+ the top bar carries
     the section nav itself, so this hides rather than wasting the desktop
     viewport's horizontal space on a phone-width tab bar. -->
<nav
	class="fixed bottom-0 left-0 right-0 z-[var(--z-mobile-nav)] mobile-nav-bar lg:hidden"
	aria-label="Main Navigation"
>
	<div class="flex items-center justify-around w-full px-0 py-0">
		{#each mobileNavItems as item}
			{@const MobileIcon = item.icon}
			<a
				href={item.href}
				class="mobile-nav-item {isActive(item.href) ? 'active' : ''}"
				aria-current={isActive(item.href) ? "page" : undefined}
				aria-label={item.label}
				data-nav={item.navKey || null}
				onclick={(e) => {
					if (item.onClick) {
						item.onClick(e);
					}
				}}
			>
				<div class="mobile-nav-icon">
					<MobileIcon
						size={24}
						strokeWidth={isActive(item.href) ? 2.5 : 2}
						aria-hidden="true"
					/>
				</div>
				<span class="text-[10px] font-semibold leading-tight"
					>{item.label}</span
				>
			</a>
		{/each}
	</div>
</nav>

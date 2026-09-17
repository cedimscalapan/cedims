import { writable } from 'svelte/store';

// Simple boolean loading state
export const isLoading = writable(true);

// Set loading state
export const setLoading = (value: boolean) => {
	isLoading.set(value);
};

// Hide loading immediately
export const hideLoading = () => {
	isLoading.set(false);
};

// Hide loading with transition effect
export const hideLoadingWithTransition = (delay: number = 300) => {
	setTimeout(() => {
		isLoading.set(false);
	}, delay);
};

// Advanced: Progress tracking store
export const progress = writable(0);
export const loadingStage = writable<'init' | 'api' | 'assets' | 'complete'>('init');

export const startLoading = () => {
	isLoading.set(true);
	progress.set(0);
	loadingStage.set('init');
};

export const updateProgress = (value: number) => {
	progress.set(Math.min(value, 95)); // Cap at 95% until complete
};

export const setLoadingStage = (stage: 'init' | 'api' | 'assets' | 'complete') => {
	loadingStage.set(stage);
};

export const completeLoading = () => {
	progress.set(100);
	loadingStage.set('complete');
	setTimeout(() => {
		isLoading.set(false);
	}, 500);
};

// Utility: Wait for multiple async operations
export const waitForOperations = async (
	operations: Promise<any>[],
	onStageChange?: (stage: string) => void
): Promise<void> => {
	startLoading();

	try {
		if (onStageChange) onStageChange('Initializing...');
		await Promise.resolve(); // Small delay for init
		updateProgress(10);

		if (onStageChange) onStageChange('Loading data...');
		await Promise.all(operations);
		updateProgress(85);

		if (onStageChange) onStageChange('Finalizing...');
		completeLoading();
	} catch (error) {
		console.error('Loading error:', error);
		// Still complete after timeout
		setTimeout(() => completeLoading(), 3000);
	}
};

// Utility: Simulate loading with artificial delay
export const simulateLoading = (duration: number = 3000) => {
	startLoading();
	setTimeout(() => completeLoading(), duration);
};

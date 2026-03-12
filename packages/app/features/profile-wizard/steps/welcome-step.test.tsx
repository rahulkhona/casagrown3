/**
 * Welcome Step Tests
 *
 * Tests the WelcomeStep component that shows post prompts after wizard completion.
 */

const mockReplace = jest.fn();
jest.mock('solito/navigation', () => ({
    useRouter: () => ({
        replace: mockReplace,
        push: jest.fn(),
    }),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => {
            const dv = (opts?.defaultValue as string) || key;
            // Simple interpolation: replace {{key}} with opts[key]
            return dv.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts?.[k] ?? k));
        },
    }),
}));

// Mock useWizard
const mockWizardData = {
    community: { h3Index: '871234567ffffff', name: 'Test Community' },
    campaignPoints: { first_post: 100 },
};

jest.mock('../wizard-context', () => ({
    useWizard: () => ({
        data: mockWizardData,
    }),
}));

// Mock Tamagui + Lucide icons
jest.mock('tamagui', () => {
    const React = require('react');
    return {
        YStack: (props: any) => React.createElement('div', { ...props, 'data-testid': props.testID }),
        XStack: (props: any) => React.createElement('div', { ...props, 'data-testid': props.testID }),
        Text: (props: any) => React.createElement('span', { ...props, 'data-testid': props.testID }, props.children),
        Button: (props: any) => React.createElement('button', {
            ...props,
            'data-testid': props.testID,
            onClick: props.onPress,
        }, props.children),
        Separator: () => React.createElement('hr'),
    };
});

jest.mock('@tamagui/lucide-icons', () => ({
    ShoppingBag: () => null,
    ShoppingCart: () => null,
    HelpCircle: () => null,
    Wrench: () => null,
    MessageCircle: () => null,
}));

jest.mock('../../../design-tokens', () => ({
    colors: {
        green: { 50: '#f0fdf4', 100: '#dcfce7', 300: '#86efac', 400: '#4ade80', 600: '#16a34a', 700: '#15803d', 800: '#166534' },
        gray: { 200: '#e5e7eb', 400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 800: '#1f2937' },
    },
    borderRadius: { lg: 8, xl: 12, full: 9999 },
    shadows: { sm: { color: '#000', offset: { width: 0, height: 1 }, radius: 2 } },
}));

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { WelcomeStep } from './welcome-step';

describe('WelcomeStep', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render all 5 prompt cards', () => {
        let tree: ReactTestRenderer;
        act(() => {
            tree = create(React.createElement(WelcomeStep));
        });
        const root = tree!.root;

        expect(root.findByProps({ testID: 'prompt-sell' })).toBeTruthy();
        expect(root.findByProps({ testID: 'prompt-buy' })).toBeTruthy();
        expect(root.findByProps({ testID: 'prompt-advice' })).toBeTruthy();
        expect(root.findByProps({ testID: 'prompt-service' })).toBeTruthy();
        expect(root.findByProps({ testID: 'prompt-intro' })).toBeTruthy();
    });

    it('should display welcome title with community name', () => {
        let tree: ReactTestRenderer;
        act(() => {
            tree = create(React.createElement(WelcomeStep));
        });
        const title = tree!.root.findByProps({ testID: 'welcome-title' });
        expect(title.props.children).toContain('Test Community');
    });

    it('should show points callout when campaign points available', () => {
        let tree: ReactTestRenderer;
        act(() => {
            tree = create(React.createElement(WelcomeStep));
        });
        const callout = tree!.root.findByProps({ testID: 'points-callout' });
        expect(callout).toBeTruthy();
    });

    it('should render skip button', () => {
        let tree: ReactTestRenderer;
        act(() => {
            tree = create(React.createElement(WelcomeStep));
        });
        const skip = tree!.root.findByProps({ testID: 'welcome-skip' });
        expect(skip).toBeTruthy();
    });

    it('should navigate to create-post with sell type when sell card clicked', () => {
        let tree: ReactTestRenderer;
        act(() => {
            tree = create(React.createElement(WelcomeStep));
        });
        const sellCard = tree!.root.findByProps({ testID: 'prompt-sell' });
        act(() => {
            sellCard.props.onPress();
        });
        expect(mockReplace).toHaveBeenCalledWith('/create-post?type=want_to_sell');
    });

    it('should navigate to create-post with buy type when buy card clicked', () => {
        let tree: ReactTestRenderer;
        act(() => {
            tree = create(React.createElement(WelcomeStep));
        });
        const buyCard = tree!.root.findByProps({ testID: 'prompt-buy' });
        act(() => {
            buyCard.props.onPress();
        });
        expect(mockReplace).toHaveBeenCalledWith('/create-post?type=want_to_buy');
    });

    it('should navigate to create-post with advice type when advice card clicked', () => {
        let tree: ReactTestRenderer;
        act(() => {
            tree = create(React.createElement(WelcomeStep));
        });
        const card = tree!.root.findByProps({ testID: 'prompt-advice' });
        act(() => {
            card.props.onPress();
        });
        expect(mockReplace).toHaveBeenCalledWith('/create-post?type=seeking_advice');
    });

    it('should navigate to create-post with service type when service card clicked', () => {
        let tree: ReactTestRenderer;
        act(() => {
            tree = create(React.createElement(WelcomeStep));
        });
        const card = tree!.root.findByProps({ testID: 'prompt-service' });
        act(() => {
            card.props.onPress();
        });
        expect(mockReplace).toHaveBeenCalledWith('/create-post?type=need_service');
    });

    it('should navigate to create-post with intro type when intro card clicked', () => {
        let tree: ReactTestRenderer;
        act(() => {
            tree = create(React.createElement(WelcomeStep));
        });
        const card = tree!.root.findByProps({ testID: 'prompt-intro' });
        act(() => {
            card.props.onPress();
        });
        expect(mockReplace).toHaveBeenCalledWith('/create-post?type=general_info');
    });

    it('should navigate to feed when skip is clicked', () => {
        let tree: ReactTestRenderer;
        act(() => {
            tree = create(React.createElement(WelcomeStep));
        });
        const skip = tree!.root.findByProps({ testID: 'welcome-skip' });
        act(() => {
            skip.props.onPress();
        });
        expect(mockReplace).toHaveBeenCalledWith('/');
    });
});

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockInvoke = jest.fn();
const mockFromEqSingle = jest.fn();

jest.mock('../auth/auth-hook', () => ({
    supabase: {
        functions: { invoke: (...args: any[]) => mockInvoke(...args) },
        from: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnValue({
                single: (...args: any[]) => mockFromEqSingle(...args),
            }),
        }),
    },
}));

jest.mock('@tamagui/lucide-icons', () => ({
    Banknote: () => null,
    X: () => null,
    AlertCircle: () => null,
    CheckCircle: () => null,
}));

jest.mock('tamagui', () => {
    const { View, Text: RNText, TouchableOpacity, ActivityIndicator, TextInput } = require('react-native');

    const SheetMock = ({ children, open }: any) => (open ? <View testID="sheet-mock">{children}</View> : null);
    SheetMock.Overlay = () => null;
    SheetMock.Handle = () => null;
    SheetMock.Frame = ({ children, ...props }: any) => <View {...props}>{children}</View>;
    SheetMock.ScrollView = ({ children, ...props }: any) => <View {...props}>{children}</View>;

    return {
        Button: ({ children, onPress, testID, ...props }: any) => (
            <TouchableOpacity onPress={onPress} testID={testID} {...props}>
                {typeof children === 'string' ? <RNText>{children}</RNText> : children}
            </TouchableOpacity>
        ),
        Text: ({ children, testID, ...props }: any) => (
            <RNText testID={testID} {...props}>{children}</RNText>
        ),
        YStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
        XStack: ({ children, ...props }: any) => <View {...props}>{children}</View>,
        Spinner: (props: any) => <ActivityIndicator {...props} />,
        Sheet: SheetMock,
        Input: (props: any) => <TextInput {...props} />
    };
});

import { CashoutSheet } from './CashoutSheet';

describe('CashoutSheet', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders with initial values and fetches profile payout id', async () => {
        mockFromEqSingle.mockResolvedValue({ data: { paypal_payout_id: 'john@example.com' }, error: null });

        render(
            <CashoutSheet
                visible={true}
                onClose={jest.fn()}
                balance={500}
                pointsToRedeem={100}
                userId="test-user"
                adjustBalance={jest.fn()}
            />
        );

        await waitFor(() => {
            // Check that it queried the database and the input contains john@example.com (input has "value" prop)
            expect(screen.getByDisplayValue('john@example.com')).toBeTruthy();
        });
    });

    it('blocks submission if pointsToRedeem > balance', async () => {
        mockFromEqSingle.mockResolvedValue({ data: { paypal_payout_id: 'john@example.com' }, error: null });

        render(
            <CashoutSheet
                visible={true}
                onClose={jest.fn()}
                balance={50} // 50 balance
                pointsToRedeem={100} // trying to redeem 100
                userId="test-user"
                adjustBalance={jest.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByDisplayValue('john@example.com')).toBeTruthy();
        });

        // The button changes text and disables itself
        await waitFor(() => {
            expect(screen.getByText('Need 100 Points')).toBeTruthy();
        });

        expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('blocks submission if missing payoutId', async () => {
        mockFromEqSingle.mockResolvedValue({ data: { paypal_payout_id: null }, error: null });

        render(
            <CashoutSheet
                visible={true}
                onClose={jest.fn()}
                balance={500}
                pointsToRedeem={100}
                userId="test-user"
                adjustBalance={jest.fn()}
            />
        );

        // Assume input is empty because profile returned null
        await waitFor(() => {
            expect(screen.getByText('Confirm Cashout')).toBeTruthy();
        });

        // Test that the button is disabled (React Native Testing Library doesn't fire events on disabled buttons)
        const btn = screen.getByText('Confirm Cashout').parent;
        // Native touchable is mocked, we can just prove mockInvoke wasn't called if we try to click
        fireEvent.press(screen.getByText('Confirm Cashout'));

        expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('calls edge function and displays JSON error correctly on failure', async () => {
        mockFromEqSingle.mockResolvedValue({ data: { paypal_payout_id: 'test@example.com' }, error: null });
        mockInvoke.mockResolvedValue({ data: null, error: { message: "Supabase edge function crashed", code: 500 } });

        render(
            <CashoutSheet
                visible={true}
                onClose={jest.fn()}
                balance={500}
                pointsToRedeem={100}
                userId="test-user"
                adjustBalance={jest.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByDisplayValue('test@example.com')).toBeTruthy();
        });

        fireEvent.press(screen.getByText('Confirm Cashout'));

        await waitFor(() => {
            // It parses and JSON stringifies the raw object
            expect(screen.getByText(/Supabase edge function crashed/)).toBeTruthy();
        });

        expect(mockInvoke).toHaveBeenCalledWith('redeem-paypal-payout', {
            body: { pointsToRedeem: 100, payoutId: 'test@example.com' }
        });
    });

    it('deducts points and shows success UI on successful edge function call', async () => {
        mockFromEqSingle.mockResolvedValue({ data: { paypal_payout_id: 'test@example.com' }, error: null });
        mockInvoke.mockResolvedValue({ data: { success: true }, error: null });

        const mockAdjustBalance = jest.fn();

        render(
            <CashoutSheet
                visible={true}
                onClose={jest.fn()}
                balance={500}
                pointsToRedeem={100}
                userId="test-user"
                adjustBalance={mockAdjustBalance}
            />
        );

        await waitFor(() => {
            expect(screen.getByDisplayValue('test@example.com')).toBeTruthy();
        });

        fireEvent.press(screen.getByText('Confirm Cashout'));

        // Wait for edge function to resolve and success text to appear
        await waitFor(() => {
            expect(screen.getByText('Funds Sent!')).toBeTruthy();
        });

        expect(mockInvoke).toHaveBeenCalledWith('redeem-paypal-payout', {
            body: { pointsToRedeem: 100, payoutId: 'test@example.com' }
        });

        expect(mockAdjustBalance).toHaveBeenCalledWith(-100);
    });
});

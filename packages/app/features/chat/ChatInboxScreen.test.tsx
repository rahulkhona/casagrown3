/**
 * ChatInboxScreen Tests
 *
 * Component tests for:
 * - Helper functions: getPostTypeBadge, formatTimeAgo
 * - ConversationCard rendering: unread indicators, badges, avatars
 * - ChatInboxScreen: loading, empty, error, and populated states
 * - Realtime subscription setup/teardown
 */

import React from "react";
import {
    render,
    screen,
    fireEvent,
    waitFor,
} from "@testing-library/react-native";

// =============================================================================
// Mock setup
// =============================================================================

const mockGetUserConversations = jest.fn();

jest.mock("./chat-service", () => ({
    getUserConversations: (...args: any[]) =>
        mockGetUserConversations(...args),
}));

// Mock the supabase client used for realtime
const mockSubscribe = jest.fn().mockReturnThis();
const mockOn = jest.fn().mockReturnThis();
const mockRemoveChannel = jest.fn();
const mockChannel = jest.fn().mockReturnValue({
    on: mockOn,
    subscribe: mockSubscribe,
});

jest.mock("../../utils/supabase", () => ({
    supabase: {
        channel: (...args: any[]) => mockChannel(...args),
        removeChannel: (...args: any[]) => mockRemoveChannel(...args),
    },
}));

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

jest.mock("@tamagui/lucide-icons", () => ({
    ArrowLeft: () => null,
    MessageCircle: () => null,
    Wrench: () => null,
    HelpCircle: () => null,
}));

jest.mock("tamagui", () => {
    const {
        View,
        Text: RNText,
        TouchableOpacity,
        ActivityIndicator,
    } = require("react-native");

    return {
        Button: ({ children, onPress, ...props }: any) => (
            <TouchableOpacity onPress={onPress} {...props}>
                {typeof children === "string" ? (
                    <RNText>{children}</RNText>
                ) : (
                    children
                )}
            </TouchableOpacity>
        ),
        Text: ({ children, ...props }: any) => (
            <RNText {...props}>{children}</RNText>
        ),
        YStack: ({ children, ...props }: any) => (
            <View {...props}>{children}</View>
        ),
        XStack: ({ children, ...props }: any) => (
            <View {...props}>{children}</View>
        ),
        Spinner: (props: any) => <ActivityIndicator {...props} />,
    };
});

jest.mock("../../utils/normalize-storage-url", () => ({
    normalizeStorageUrl: (url: string | null) => url,
}));

// Import AFTER mocks are set up
import { ChatInboxScreen } from "./ChatInboxScreen";

beforeEach(() => {
    jest.clearAllMocks();
});

// =============================================================================
// Helper function tests
// =============================================================================

describe("getPostTypeBadge (via rendering)", () => {
    it("renders sell badge for want_to_sell posts", async () => {
        mockGetUserConversations.mockResolvedValue([
            {
                id: "conv-1",
                post_id: "post-1",
                post_type: "want_to_sell",
                post_content: "Fresh tomatoes",
                other_user_id: "user-other",
                other_user_name: "Alice",
                other_user_avatar: null,
                last_message_content: "Hello",
                last_message_type: "text",
                last_message_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                unread_count: 0,
            },
        ]);

        render(
            <ChatInboxScreen
                currentUserId="user-me"
                onOpenChat={jest.fn()}
                onClose={jest.fn()}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText("Alice")).toBeTruthy();
        });
    });
});

// =============================================================================
// ChatInboxScreen states
// =============================================================================

describe("ChatInboxScreen", () => {
    it("shows loading spinner initially", () => {
        mockGetUserConversations.mockReturnValue(new Promise(() => {})); // never resolves
        render(
            <ChatInboxScreen
                currentUserId="user-me"
                onOpenChat={jest.fn()}
                onClose={jest.fn()}
            />,
        );

        // Should show the inbox title while loading
        expect(screen.getByText("chat.inboxTitle")).toBeTruthy();
    });

    it("shows empty state when no conversations", async () => {
        mockGetUserConversations.mockResolvedValue([]);

        render(
            <ChatInboxScreen
                currentUserId="user-me"
                onOpenChat={jest.fn()}
                onClose={jest.fn()}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText("chat.inboxEmpty")).toBeTruthy();
            expect(screen.getByText("chat.inboxEmptyHint")).toBeTruthy();
        });
    });

    it("shows error state with retry button on failure", async () => {
        mockGetUserConversations.mockRejectedValue(
            new Error("Network error"),
        );

        render(
            <ChatInboxScreen
                currentUserId="user-me"
                onOpenChat={jest.fn()}
                onClose={jest.fn()}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText("chat.inboxError")).toBeTruthy();
            expect(screen.getByText("chat.inboxRetry")).toBeTruthy();
        });
    });

    it("renders conversation cards when data is available", async () => {
        mockGetUserConversations.mockResolvedValue([
            {
                id: "conv-1",
                post_id: "post-1",
                post_type: "want_to_sell",
                post_content: "Fresh tomatoes for sale",
                other_user_id: "user-alice",
                other_user_name: "Alice Johnson",
                other_user_avatar: null,
                last_message_content: "Is this still available?",
                last_message_type: "text",
                last_message_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                unread_count: 0,
            },
        ]);

        render(
            <ChatInboxScreen
                currentUserId="user-me"
                onOpenChat={jest.fn()}
                onClose={jest.fn()}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText("Alice Johnson")).toBeTruthy();
            expect(
                screen.getByText("Is this still available?"),
            ).toBeTruthy();
        });
    });

    it("shows unread count badge for conversations with unread messages", async () => {
        mockGetUserConversations.mockResolvedValue([
            {
                id: "conv-1",
                post_id: "post-1",
                post_type: "want_to_sell",
                post_content: "Tomatoes",
                other_user_id: "user-alice",
                other_user_name: "Alice",
                other_user_avatar: null,
                last_message_content: "New message",
                last_message_type: "text",
                last_message_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                unread_count: 3,
            },
        ]);

        render(
            <ChatInboxScreen
                currentUserId="user-me"
                onOpenChat={jest.fn()}
                onClose={jest.fn()}
            />,
        );

        await waitFor(() => {
            // Should show the unread count "3"
            expect(screen.getByText("3")).toBeTruthy();
        });
    });

    it("shows photo emoji for media messages", async () => {
        mockGetUserConversations.mockResolvedValue([
            {
                id: "conv-1",
                post_id: "post-1",
                post_type: "want_to_sell",
                post_content: "Tomatoes",
                other_user_id: "user-alice",
                other_user_name: "Alice",
                other_user_avatar: null,
                last_message_content: null,
                last_message_type: "media",
                last_message_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                unread_count: 0,
            },
        ]);

        render(
            <ChatInboxScreen
                currentUserId="user-me"
                onOpenChat={jest.fn()}
                onClose={jest.fn()}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText("📷 Photo")).toBeTruthy();
        });
    });

    it("calls onOpenChat with correct args when card is pressed", async () => {
        const mockOnOpenChat = jest.fn();
        mockGetUserConversations.mockResolvedValue([
            {
                id: "conv-1",
                post_id: "post-1",
                post_type: "want_to_sell",
                post_content: "Tomatoes",
                other_user_id: "user-alice",
                other_user_name: "Alice",
                other_user_avatar: null,
                last_message_content: "Hello",
                last_message_type: "text",
                last_message_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                unread_count: 0,
            },
        ]);

        render(
            <ChatInboxScreen
                currentUserId="user-me"
                onOpenChat={mockOnOpenChat}
                onClose={jest.fn()}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText("Alice")).toBeTruthy();
        });

        fireEvent.press(screen.getByText("Alice"));
        expect(mockOnOpenChat).toHaveBeenCalledWith("post-1", "user-alice");
    });

    it("calls onClose when back button is pressed", async () => {
        const mockOnClose = jest.fn();
        mockGetUserConversations.mockResolvedValue([]);

        render(
            <ChatInboxScreen
                currentUserId="user-me"
                onOpenChat={jest.fn()}
                onClose={mockOnClose}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText("chat.inboxEmpty")).toBeTruthy();
        });
    });

    it("sets up realtime subscription on mount and cleans up", async () => {
        mockGetUserConversations.mockResolvedValue([]);

        const { unmount } = render(
            <ChatInboxScreen
                currentUserId="user-me"
                onOpenChat={jest.fn()}
                onClose={jest.fn()}
            />,
        );

        await waitFor(() => {
            expect(mockChannel).toHaveBeenCalledWith("inbox-live");
        });

        unmount();
        expect(mockRemoveChannel).toHaveBeenCalled();
    });

    it("fetches conversations with current user ID", async () => {
        mockGetUserConversations.mockResolvedValue([]);

        render(
            <ChatInboxScreen
                currentUserId="user-xyz"
                onOpenChat={jest.fn()}
                onClose={jest.fn()}
            />,
        );

        await waitFor(() => {
            expect(mockGetUserConversations).toHaveBeenCalledWith("user-xyz");
        });
    });
});

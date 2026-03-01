/**
 * useCategoryProductStatus — Chat restriction hook
 *
 * Checks if the post's category or product is restricted in the poster's community.
 * Returns { restricted, reason, loading } so the Chat UI can:
 *  • Disable Place Order / Make Offer buttons
 *  • Show a restriction banner
 *  • Disable Accept / Counter on ChatOfferActions
 *  • Disable Confirm / Modify on ChatOrderActions
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../auth/auth-hook";

interface RestrictionStatus {
    /** Whether any restriction applies (category or product) */
    restricted: boolean;
    /** Human-readable reason for the restriction */
    reason: string | null;
    /** Whether the check is still running */
    loading: boolean;
}

/**
 * Check if the post's category or product name is restricted.
 *
 * @param postId - The post to check (null/undefined = skip)
 */
export function useCategoryProductStatus(
    postId: string | null | undefined,
): RestrictionStatus {
    const { t } = useTranslation();
    const [status, setStatus] = useState<RestrictionStatus>({
        restricted: false,
        reason: null,
        loading: true,
    });

    useEffect(() => {
        if (!postId) {
            setStatus({ restricted: false, reason: null, loading: false });
            return;
        }

        let cancelled = false;

        async function check() {
            try {
                // 1. Get post details: category, product name, community
                const { data: post, error: postErr } = await supabase
                    .from("posts")
                    .select(`
            community_h3_index, is_archived,
            want_to_sell_details ( category, produce_name ),
            want_to_buy_details ( category, produce_names )
          `)
                    .eq("id", postId)
                    .single();

                if (cancelled) return;
                if (postErr || !post) {
                    setStatus({
                        restricted: false,
                        reason: null,
                        loading: false,
                    });
                    return;
                }

                // If post is already archived, it's restricted
                if (post.is_archived) {
                    if (!cancelled) {
                        setStatus({
                            restricted: true,
                            reason: t("chat.restriction.archived"),
                            loading: false,
                        });
                    }
                    return;
                }

                const communityH3 = post.community_h3_index;
                const sellDetails = Array.isArray(post.want_to_sell_details)
                    ? post.want_to_sell_details[0]
                    : post.want_to_sell_details;
                const buyDetails = Array.isArray(post.want_to_buy_details)
                    ? post.want_to_buy_details[0]
                    : post.want_to_buy_details;

                const category = sellDetails?.category ||
                    buyDetails?.category || null;
                const productName = sellDetails?.produce_name || null;
                const produceNames: string[] = buyDetails?.produce_names || [];

                // 2. Check category restrictions
                if (category) {
                    let catQuery = supabase
                        .from("category_restrictions")
                        .select("category_name, reason")
                        .eq("category_name", category);

                    if (communityH3) {
                        catQuery = catQuery.or(
                            `community_h3_index.is.null,community_h3_index.eq.${communityH3}`,
                        );
                    } else {
                        catQuery = catQuery.is("community_h3_index", null);
                    }

                    const { data: catRestrictions } = await catQuery.limit(1);
                    if (cancelled) return;

                    if (catRestrictions && catRestrictions.length > 0) {
                        setStatus({
                            restricted: true,
                            reason: catRestrictions[0].reason ||
                                t("chat.restriction.categoryRestricted", {
                                    category,
                                }),
                            loading: false,
                        });
                        return;
                    }
                }

                // 3. Check product restrictions (sell post product name)
                if (productName) {
                    let prodQuery = supabase
                        .from("blocked_products")
                        .select("product_name, reason")
                        .ilike("product_name", productName);

                    if (communityH3) {
                        prodQuery = prodQuery.or(
                            `community_h3_index.is.null,community_h3_index.eq.${communityH3}`,
                        );
                    } else {
                        prodQuery = prodQuery.is("community_h3_index", null);
                    }

                    const { data: prodBlocks } = await prodQuery.limit(1);
                    if (cancelled) return;

                    if (prodBlocks && prodBlocks.length > 0) {
                        setStatus({
                            restricted: true,
                            reason: prodBlocks[0].reason ||
                                t("chat.restriction.productRestricted", {
                                    product: productName,
                                }),
                            loading: false,
                        });
                        return;
                    }
                }

                // 4. Check product restrictions for buy post produce names
                for (const name of produceNames) {
                    let buyProdQuery = supabase
                        .from("blocked_products")
                        .select("product_name, reason")
                        .ilike("product_name", name);

                    if (communityH3) {
                        buyProdQuery = buyProdQuery.or(
                            `community_h3_index.is.null,community_h3_index.eq.${communityH3}`,
                        );
                    } else {
                        buyProdQuery = buyProdQuery.is(
                            "community_h3_index",
                            null,
                        );
                    }

                    const { data: buyBlocks } = await buyProdQuery.limit(1);
                    if (cancelled) return;

                    if (buyBlocks && buyBlocks.length > 0) {
                        setStatus({
                            restricted: true,
                            reason: buyBlocks[0].reason ||
                                t("chat.restriction.productRestricted", {
                                    product: name,
                                }),
                            loading: false,
                        });
                        return;
                    }
                }

                // No restrictions found
                if (!cancelled) {
                    setStatus({
                        restricted: false,
                        reason: null,
                        loading: false,
                    });
                }
            } catch (err) {
                console.error("Error checking restriction status:", err);
                if (!cancelled) {
                    // Fail open — don't block transactions on an error
                    setStatus({
                        restricted: false,
                        reason: null,
                        loading: false,
                    });
                }
            }
        }

        check();
        return () => {
            cancelled = true;
        };
    }, [postId]);

    return status;
}

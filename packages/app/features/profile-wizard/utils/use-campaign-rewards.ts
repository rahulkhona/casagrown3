import { useEffect, useState } from "react";
import { supabase } from "../../auth/auth-hook";

type CampaignReward = {
    behavior: string;
    points: number;
};

/**
 * Fetches active campaign rewards from campaign_rewards + incentive_campaigns.
 * If multiple campaigns reward the same behavior, picks the one with the most points.
 * Falls back to sensible defaults if no campaigns exist.
 */
export const useCampaignRewards = () => {
    const [rewards, setRewards] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRewards = async () => {
            try {
                const now = new Date().toISOString();

                const { data, error } = await supabase
                    .from("campaign_rewards")
                    .select(`
            behavior,
            points,
            incentive_campaigns!inner (
              is_active,
              starts_at,
              ends_at
            )
          `)
                    .eq("incentive_campaigns.is_active", true)
                    .lte("incentive_campaigns.starts_at", now)
                    .gte("incentive_campaigns.ends_at", now);

                if (error) {
                    if (error.message || error.code) {
                        console.error(
                            "Error fetching campaign rewards:",
                            error,
                        );
                    }
                    // Use fallback defaults
                    setRewards({
                        signup: 100,
                        first_post: 75,
                        per_referral: 50,
                    });
                    return;
                }

                if (data) {
                    const rewardMap: Record<string, number> = {};
                    data.forEach((reward: CampaignReward) => {
                        // If multiple campaigns, take the max points for each behavior
                        if (
                            !rewardMap[reward.behavior] ||
                            reward.points > rewardMap[reward.behavior]
                        ) {
                            rewardMap[reward.behavior] = reward.points;
                        }
                    });
                    setRewards(rewardMap);
                }
            } catch (err) {
                console.error("Failed to fetch campaign rewards", err);
            } finally {
                setLoading(false);
            }
        };

        fetchRewards();
    }, []);

    const getPoints = (behavior: string, fallback = 0) => {
        return rewards[behavior] ?? fallback;
    };

    return {
        rewards,
        getPoints,
        loading,
    };
};

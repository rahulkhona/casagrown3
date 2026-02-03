import { useEffect, useState } from "react";
import { supabase } from "../../auth/auth-hook";

type IncentiveRule = {
    action_type: string;
    points: number;
};

export const useIncentiveRules = () => {
    const [rules, setRules] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRules = async () => {
            try {
                // Fetch active rules
                // For now, we just fetch global rules. in future we can scope by user location.
                const { data, error } = await supabase
                    .from("incentive_rules")
                    .select("action_type, points")
                    .eq("scope", "global")
                    .or(`end_date.is.null,end_date.gt.${
                        new Date().toISOString()
                    }`);

                if (error) {
                    // Only log if there's actual error content (not just auth issues during init)
                    if (error.message || error.code) {
                        console.error("Error fetching incentive rules:", error);
                    }
                    // Use fallback defaults
                    setRules({
                        join_a_community: 50,
                        make_first_post: 50,
                    });
                    return;
                }

                if (data) {
                    const ruleMap: Record<string, number> = {};
                    data.forEach((rule: IncentiveRule) => {
                        // If multiple rules for same action, take the max (or could sum depending on logic)
                        // Simple overwrite for now
                        ruleMap[rule.action_type] = rule.points;
                    });
                    setRules(ruleMap);
                }
            } catch (err) {
                console.error("Failed to fetch incentive rules", err);
            } finally {
                setLoading(false);
            }
        };

        fetchRules();
    }, []);

    const getPoints = (action: string, fallback = 0) => {
        return rules[action] ?? fallback;
    };

    return {
        points: rules,
        getPoints,
        loading,
    };
};

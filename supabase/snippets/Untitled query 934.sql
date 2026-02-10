SELECT pi.produce_name, pi.is_custom, pi.created_at FROM produce_interests pi JOIN profiles pr ON pi.user_id = pr.id WHERE pr.email = 'znew2@znew2.com';SELECT
  pr.email,
    pr.full_name,
      pr.avatar_url,
        pr.home_community_h3_index,
          p.id as post_id,
            p.type as post_type,
              p.content,
                p.created_at as post_created,
                  ma.id as media_id,
                    ma.storage_path,
                      ma.media_type,
                        ma.mime_type,
                          pm.position as media_posiSELECT pr.email, pr.full_name, pr.avatar_url, pr.home_community_h3_index, p.id as post_id, p.type as post_type, p.content, p.created_at as post_created, ma.id as media_id, ma.storage_path, ma.media_type, ma.mime_type, pm.position as media_position, pi2.produce_name, pi2.is_custom FROM profiles pr LEFT JOIN posts p ON p.author_id = pr.id LEFT JOIN post_media pm ON pm.post_id = p.id LEFT JOIN media_assets ma ON pm.media_id = ma.id LEFT JOIN produce_interests pi2 ON pi2.user_id = pr.id WHERE pr.email IN ('znewios@znewios.com', 'znewandroid@znewandroid.com') ORDER BY pr.email, p.created_at;tion,
                            pi2.produce_name,
                              pi2.is_custom
                              FROM profiles precedingLEFT JOIN posts p ON p.author_id = pr.id
                              LEFT JOIN post_media pm ON pm.post_id = p.id
                              LEFT JOIN media_assets ma ON pm.media_id = ma.id
                              LEFT JOIN produce_interests pi2 ON pi2.user_id = pr.id
                              WHERE pr.email IN ('znewios@znewios.com', 'znewandroid@znewandroid.com')
                              ORDER BY pr.email, p.created_at;

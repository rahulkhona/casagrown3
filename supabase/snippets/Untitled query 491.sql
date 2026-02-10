SELECT p.id, p.type, p.reach, p.content, p.created_at, _await_response       ma.storage_path, ma.media_type, ma.mime_type,
       pm.position as media_position
       FROM posts p _await_responseJOIN profiles pr ON p.author_id = pr.id
       LEFT JOIN post_media pm ON pm.post_id = p.id
       LEFT JOIN media_assets ma ON pm.media_id = ma.id
       WHERE pr.email = 'znew3@znew3.com' _await_responseORDER BY p.created_at DESC;
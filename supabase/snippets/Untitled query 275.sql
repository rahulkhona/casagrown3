SELECT _await_response  t.table_name,
  c.column_name,
    c.data_type,
      c.column_default,
        c.is_nullable,
          c.character_maximum_length,
            tc.constraint_type,
              kcu2.table_name as foreign_table,
                kcu2.column_name as foreign_column
                FROM information_schema.tables tableJOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.f_table_schemaLEFT JOIN information_schema.key_column_usage kcu ON c.table_name = kcu.table_name AND c.column_name = kcu.column_name AND c.table_schema = kcu.table_schema
                LEFT JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name AND tc.table_schema = kcu.table_schema
                LEFT JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
                LEFT JOIN information_schema.key_column_usage kcu2 ON rc.unique
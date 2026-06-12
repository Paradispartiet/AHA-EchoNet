-- AHA-EchoNet Supabase RLS policies
-- Run this after supabase/schema.sql.
-- Policy model: each authenticated Supabase user owns the profile row where aha_profiles.id = auth.uid().

create policy "aha_profiles_select_own"
  on public.aha_profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "aha_profiles_insert_own"
  on public.aha_profiles
  for insert
  to authenticated
  with check (id = auth.uid());

create policy "aha_profiles_update_own"
  on public.aha_profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "aha_source_events_select_own"
  on public.aha_source_events
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "aha_source_events_insert_own"
  on public.aha_source_events
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "aha_source_events_update_own"
  on public.aha_source_events
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "aha_notes_select_own"
  on public.aha_notes
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "aha_notes_insert_own"
  on public.aha_notes
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "aha_notes_update_own"
  on public.aha_notes
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "aha_gallery_items_select_own"
  on public.aha_gallery_items
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "aha_gallery_items_insert_own"
  on public.aha_gallery_items
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "aha_gallery_items_update_own"
  on public.aha_gallery_items
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "aha_feed_posts_select_own"
  on public.aha_feed_posts
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "aha_feed_posts_insert_own"
  on public.aha_feed_posts
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "aha_feed_posts_update_own"
  on public.aha_feed_posts
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "aha_insta_posts_select_own"
  on public.aha_insta_posts
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "aha_insta_posts_insert_own"
  on public.aha_insta_posts
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "aha_insta_posts_update_own"
  on public.aha_insta_posts
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "aha_insta_profiles_select_own"
  on public.aha_insta_profiles
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "aha_insta_profiles_insert_own"
  on public.aha_insta_profiles
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "aha_insta_profiles_update_own"
  on public.aha_insta_profiles
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "aha_insta_likes_select_own"
  on public.aha_insta_likes
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "aha_insta_likes_insert_own"
  on public.aha_insta_likes
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "aha_insta_likes_update_own"
  on public.aha_insta_likes
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "aha_insta_comments_select_own"
  on public.aha_insta_comments
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "aha_insta_comments_insert_own"
  on public.aha_insta_comments
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "aha_insta_comments_update_own"
  on public.aha_insta_comments
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "aha_insta_follows_select_own"
  on public.aha_insta_follows
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "aha_insta_follows_insert_own"
  on public.aha_insta_follows
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "aha_insta_follows_update_own"
  on public.aha_insta_follows
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "aha_imports_select_own"
  on public.aha_imports
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "aha_imports_insert_own"
  on public.aha_imports
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "aha_imports_update_own"
  on public.aha_imports
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- AHA Music Spotify import MVP policies.
create policy "music_sources_select_own"
  on public.music_sources
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "music_sources_insert_own"
  on public.music_sources
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "music_sources_update_own"
  on public.music_sources
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "music_playlists_select_own"
  on public.music_playlists
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "music_playlists_insert_own"
  on public.music_playlists
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "music_playlists_update_own"
  on public.music_playlists
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "music_tracks_select_own"
  on public.music_tracks
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "music_tracks_insert_own"
  on public.music_tracks
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "music_tracks_update_own"
  on public.music_tracks
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "music_albums_select_own"
  on public.music_albums
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "music_albums_insert_own"
  on public.music_albums
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "music_albums_update_own"
  on public.music_albums
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "music_artists_select_own"
  on public.music_artists
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "music_artists_insert_own"
  on public.music_artists
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "music_artists_update_own"
  on public.music_artists
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "music_track_artists_select_own"
  on public.music_track_artists
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "music_track_artists_insert_own"
  on public.music_track_artists
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "music_track_artists_update_own"
  on public.music_track_artists
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "music_playlist_tracks_select_own"
  on public.music_playlist_tracks
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "music_playlist_tracks_insert_own"
  on public.music_playlist_tracks
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "music_playlist_tracks_update_own"
  on public.music_playlist_tracks
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

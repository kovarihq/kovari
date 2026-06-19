import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/network/location_service.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_radius.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/shared/widgets/text_input_field.dart';

class LocationAutocomplete extends ConsumerStatefulWidget {
  const LocationAutocomplete({
    super.key,
    required this.label,
    this.controller,
    this.initialValue,
    this.hintText,
    required this.onSelect,
    this.fillColor,
    this.contentPadding,
  });
  final String label;
  final TextEditingController? controller;
  final String? initialValue;
  final String? hintText;
  final void Function(GeoapifyResult) onSelect;
  final Color? fillColor;
  final EdgeInsetsGeometry? contentPadding;

  @override
  ConsumerState<LocationAutocomplete> createState() =>
      _LocationAutocompleteState();
}

class _LocationAutocompleteState extends ConsumerState<LocationAutocomplete> {
  late final TextEditingController _controller;
  final FocusNode _focusNode = FocusNode();
  final LayerLink _layerLink = LayerLink();
  final GlobalKey _fieldKey = GlobalKey();
  OverlayEntry? _overlayEntry;
  List<GeoapifyResult> _suggestions = [];
  bool _isLoading = false;
  Timer? _debounceTimer;

  @override
  void initState() {
    super.initState();
    _controller = widget.controller ?? TextEditingController();
    if (widget.initialValue != null) {
      _controller.text = widget.initialValue!;
    }
    _focusNode.addListener(_onFocusChange);
  }

  void _onFocusChange() {
    if (!_focusNode.hasFocus) {
      _hideOverlay();
    } else if (_controller.text.length >= 3) {
      _showOverlay();
    }
  }

  void _onChanged(String value) {
    if (value.trim().length < 3) {
      _hideOverlay();
      setState(() => _suggestions = []);
      return;
    }

    _showOverlay(); // Show "Searching..." state immediately
    _debounceTimer?.cancel();
    _debounceTimer = Timer(
      const Duration(milliseconds: 400),
      () => _fetchSuggestions(value),
    );
  }

  Future<void> _fetchSuggestions(String query) async {
    setState(() => _isLoading = true);
    _updateOverlay();

    final service = LocationService();
    final results = await service.searchLocation(query);

    if (mounted) {
      setState(() {
        _suggestions = results;
        _isLoading = false;
      });
      _updateOverlay();
    }
  }

  void _showOverlay() {
    if (_overlayEntry != null) {
      _updateOverlay();
      return;
    }

    final overlay = Overlay.of(context);
    _overlayEntry = OverlayEntry(
      builder: (context) {
        final renderBox =
            _fieldKey.currentContext?.findRenderObject() as RenderBox?;
        final size = renderBox?.size ?? Size.zero;

        return Positioned(
          width: size.width,
          child: CompositedTransformFollower(
            link: _layerLink,
            showWhenUnlinked: false,
            offset: Offset(0, size.height + 4),
            child: TapRegion(
              groupId: 'location_autocomplete',
              child: Material(
                elevation: 8,
                borderRadius: AppRadius.large,
                color: AppColors.surface(context, level: 2),
                shadowColor: Colors.black.withValues(alpha: 0.1),
                child: Container(
                  constraints: const BoxConstraints(maxHeight: 240),
                  decoration: BoxDecoration(
                    border: Border.all(color: AppColors.borderColor(context)),
                    borderRadius: AppRadius.large,
                  ),
                  child: _buildOverlayContent(context),
                ),
              ),
            ),
          ),
        );
      },
    );

    overlay.insert(_overlayEntry!);
  }

  Widget _buildOverlayContent(BuildContext context) {
    if (_isLoading) {
      return Padding(
        padding: widget.contentPadding ?? const EdgeInsets.all(10),
        child: const Center(
          child: SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }

    if (_suggestions.isEmpty) {
      return Padding(
        padding: widget.contentPadding ?? const EdgeInsets.all(10),
        child: Center(
          child: Text(
            'No results found',
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.text(context, isMuted: true),
            ),
          ),
        ),
      );
    }

    return SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final suggestion in _suggestions)
            InkWell(
              onTap: () async {
                // 1. Update UI immediately (match web)
                _controller.text = suggestion.formatted;
                _hideOverlay();
                _focusNode.unfocus();

                if (!mounted) return;
                setState(() => _isLoading = true);
                final service = LocationService();
                final details = await service.getLocationDetails(
                  suggestion.placeId,
                );

                if (!mounted) return;
                setState(() => _isLoading = false);

                if (details != null) {
                  widget.onSelect(details);
                } else {
                  widget.onSelect(suggestion);
                }
              },
              child: Padding(
                padding:
                    widget.contentPadding ??
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      suggestion.city.isNotEmpty
                          ? suggestion.city
                          : suggestion.formatted.split(',')[0],
                      style: AppTextStyles.bodyMedium.copyWith(
                        fontWeight: FontWeight.w500,
                        height: 1.1,
                        color: AppColors.text(context),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      suggestion.formatted,
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.text(context, isMuted: true),
                        height: 1.1,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  void _updateOverlay() {
    _overlayEntry?.markNeedsBuild();
  }

  void _hideOverlay() {
    _overlayEntry?.remove();
    _overlayEntry = null;
  }

  @override
  Widget build(BuildContext context) => TapRegion(
    groupId: 'location_autocomplete',
    onTapOutside: (_) => _hideOverlay(),
    child: CompositedTransformTarget(
      link: _layerLink,
      child: TextInputField(
        key: _fieldKey,
        label: widget.label,
        controller: _controller,
        focusNode: _focusNode,
        hintText: widget.hintText ?? 'Search city...',
        onChanged: _onChanged,
        fillColor: widget.fillColor,
        contentPadding: widget.contentPadding,
      ),
    ),
  );

  @override
  void dispose() {
    _debounceTimer?.cancel();
    if (widget.controller == null) {
      _controller.dispose();
    }
    _focusNode.removeListener(_onFocusChange);
    _focusNode.dispose();
    _hideOverlay();
    super.dispose();
  }
}

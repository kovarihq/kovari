import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/features/groups/models/group.dart';
import 'package:mobile/features/groups/providers/entity_stores.dart';
import 'package:mobile/features/groups/providers/group_details_provider.dart';
import 'package:mobile/shared/widgets/kovari_avatar.dart';
import 'package:mobile/shared/widgets/primary_button.dart';
import 'package:mobile/shared/widgets/secondary_button.dart';
import 'package:mobile/shared/widgets/select_field.dart';
import 'package:mobile/shared/widgets/text_input_field.dart';

class ItineraryFormModal extends ConsumerStatefulWidget {

  const ItineraryFormModal({
    super.key,
    required this.groupId,
    this.initialItem,
    this.initialStatus,
  });
  final String groupId;
  final ItineraryItem? initialItem;
  final String? initialStatus;

  @override
  ConsumerState<ItineraryFormModal> createState() => _ItineraryFormModalState();
}

class _ItineraryFormModalState extends ConsumerState<ItineraryFormModal> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _titleController;
  late TextEditingController _descriptionController;
  late TextEditingController _locationController;
  late TextEditingController _notesController;
  late DateTime _selectedDate;
  late TimeOfDay _selectedTime;
  late String _selectedType;
  late String _selectedStatus;
  late String _selectedPriority;
  List<String> _selectedAssignedTo = [];
  bool _isSubmitting = false;

  final List<String> _statuses = [
    'pending',
    'confirmed',
    'completed',
    'cancelled',
  ];
  final List<String> _priorities = ['low', 'medium', 'high'];

  @override
  void initState() {
    super.initState();
    final item = widget.initialItem;
    _titleController = TextEditingController(text: item?.title ?? '');
    _descriptionController = TextEditingController(
      text: item?.description ?? '',
    );
    _locationController = TextEditingController(text: item?.location ?? '');
    _notesController = TextEditingController(text: item?.notes ?? '');

    var initialDateTime = DateTime.now();
    if (item?.datetime != null) {
      try {
        initialDateTime = DateTime.parse(item!.datetime);
      } catch (e) {
        initialDateTime = DateTime.now();
      }
    }
    _selectedDate = initialDateTime;
    _selectedTime = TimeOfDay.fromDateTime(initialDateTime);

    _selectedType = item?.type ?? 'other';
    _selectedStatus = item?.status ?? widget.initialStatus ?? 'pending';
    _selectedPriority = item?.priority ?? 'medium';
    _selectedAssignedTo = item?.assignedTo ?? [];
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _locationController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  String _formatDate(DateTime date) => DateFormat('MMMM d, y').format(date);

  String _formatTime(TimeOfDay time) {
    final now = DateTime.now();
    final dt = DateTime(now.year, now.month, now.day, time.hour, time.minute);
    return DateFormat('HH:mm').format(dt);
  }

  Future<void> _pickDate() async {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2030),
      builder: (context, child) => Theme(
          data: Theme.of(context).copyWith(
            colorScheme: isDark
                ? ColorScheme.dark(
                    primary: AppColors.primary,
                    onPrimary: Colors.white,
                    surface: AppColors.surface(context, level: 2),
                    onSurface: AppColors.foregroundDark,
                  )
                : const ColorScheme.light(
                    primary: AppColors.primary,
                    onSurface: AppColors.foreground,
                  ),
          ),
          child: child!,
        ),
    );
    if (picked != null && picked != _selectedDate) {
      setState(() {
        _selectedDate = picked;
      });
    }
  }

  Future<void> _pickTime() async {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final picked = await showTimePicker(
      context: context,
      initialTime: _selectedTime,
      builder: (context, child) => Theme(
          data: Theme.of(context).copyWith(
            colorScheme: isDark
                ? ColorScheme.dark(
                    primary: AppColors.primary,
                    onPrimary: Colors.white,
                    surface: AppColors.surface(context, level: 2),
                    onSurface: AppColors.foregroundDark,
                  )
                : const ColorScheme.light(
                    primary: AppColors.primary,
                    onSurface: AppColors.foreground,
                  ),
          ),
          child: child!,
        ),
    );
    if (picked != null && picked != _selectedTime) {
      setState(() {
        _selectedTime = picked;
      });
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);

    try {
      final combinedDateTime = DateTime(
        _selectedDate.year,
        _selectedDate.month,
        _selectedDate.day,
        _selectedTime.hour,
        _selectedTime.minute,
      ).toIso8601String();

      final data = {
        'title': _titleController.text.trim(),
        'description': _descriptionController.text.trim(),
        'datetime': combinedDateTime,
        'type': _selectedType,
        'status': _selectedStatus,
        'location': _locationController.text.trim(),
        'priority': _selectedPriority,
        'assigned_to': _selectedAssignedTo,
        'group_id': widget.groupId,
        'notes': _notesController.text.trim(),
      };

      final notifier = ref.read(groupActionsProvider(widget.groupId));
      if (widget.initialItem != null) {
        await notifier.updateItineraryItem(widget.initialItem!.id, data);
      } else {
        await notifier.createItineraryItem(data);
      }

      if (mounted) context.pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: ${e.toString()}')));
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final membersState = ref.watch(memberStoreProvider.select((s) => s[widget.groupId]));

    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final maxHeight = MediaQuery.of(context).size.height * 0.65;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface(context, level: 1),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(bottom: bottomInset),
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag Handle
          Center(
            child: Container(
              margin: const EdgeInsets.symmetric(vertical: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.borderColor(context),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                widget.initialItem == null
                                      ? 'Add Itinerary Item'
                                      : 'Edit Itinerary Item',
                                style: AppTextStyles.h2.copyWith(
                                  fontSize: 14,
                                  color: AppColors.text(context),
                                  letterSpacing: 0,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                widget.initialItem == null
                                      ? 'Create a new activity or event for your group.'
                                      : 'Update the details of this itinerary item.',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: AppTextStyles.bodySmall.copyWith(
                                  color: AppColors.text(context, isMuted: true),
                                  height: 1.3,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  Divider(height: 1, color: AppColors.borderColor(context)),
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 20,
                    ),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          TextInputField(
                            label: 'Title',
                            controller: _titleController,
                            hintText: 'Activity title',
                            validator: (v) =>
                                v?.isEmpty == true ? 'Title is required' : null,
                          ),
                          const SizedBox(height: 20),
                          TextInputField(
                            label: 'Description',
                            controller: _descriptionController,
                            hintText: 'Activity description',
                            maxLines: 3,
                          ),
                          const SizedBox(height: 20),
                          Padding(
                            padding: const EdgeInsets.only(left: 4),
                            child: Text(
                              'Date & Time',
                              style: AppTextStyles.label.copyWith(
                                color: AppColors.text(context, isMuted: true),
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              Expanded(
                                flex: 3,
                                child: GestureDetector(
                                  onTap: _pickDate,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 10,
                                    ),
                                    decoration: BoxDecoration(
                                      border: Border.all(
                                        color: AppColors.borderColor(context),
                                      ),
                                      borderRadius: BorderRadius.circular(12),
                                      color: AppColors.surface(
                                        context,
                                        level: 2,
                                      ),
                                    ),
                                    child: Row(
                                      children: [
                                        Icon(
                                          LucideIcons.calendar,
                                          size: 16,
                                          color: AppColors.text(
                                            context,
                                            isMuted: true,
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: Text(
                                            _formatDate(_selectedDate),
                                            overflow: TextOverflow.ellipsis,
                                            style: AppTextStyles.bodyMedium
                                                .copyWith(
                                                  color: AppColors.text(
                                                    context,
                                                  ),
                                                  fontWeight: FontWeight.w500,
                                                ),
                                          ),
                                        ),
                                        const SizedBox(width: 4),
                                        Icon(
                                          LucideIcons.chevronDown,
                                          size: 14,
                                          color: AppColors.text(
                                            context,
                                            isMuted: true,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                flex: 2,
                                child: GestureDetector(
                                  onTap: _pickTime,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 10,
                                    ),
                                    decoration: BoxDecoration(
                                      border: Border.all(
                                        color: AppColors.borderColor(context),
                                      ),
                                      borderRadius: BorderRadius.circular(12),
                                      color: AppColors.surface(
                                        context,
                                        level: 2,
                                      ),
                                    ),
                                    child: Row(
                                      children: [
                                        Icon(
                                          LucideIcons.clock,
                                          size: 16,
                                          color: AppColors.text(
                                            context,
                                            isMuted: true,
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Text(
                                          _formatTime(_selectedTime),
                                          style: AppTextStyles.bodyMedium
                                              .copyWith(
                                                color: AppColors.text(context),
                                                fontWeight: FontWeight.w500,
                                              ),
                                        ),
                                        const Spacer(),
                                        Icon(
                                          LucideIcons.chevronDown,
                                          size: 14,
                                          color: AppColors.text(
                                            context,
                                            isMuted: true,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 20),
                          TextInputField(
                            label: 'Location',
                            controller: _locationController,
                            hintText: 'Where is this happening?',
                            prefixIcon: Icon(
                              LucideIcons.mapPin,
                              size: 16,
                              color: AppColors.text(context, isMuted: true),
                            ),
                          ),
                          const SizedBox(height: 20),
                          SelectField<String>(
                            label: 'Priority',
                            value: _selectedPriority,
                            hintText: 'Select priority',
                            options: _priorities,
                            itemLabelBuilder: (p) =>
                                p[0].toUpperCase() + p.substring(1),
                            onChanged: (v) =>
                                setState(() => _selectedPriority = v!),
                          ),
                          const SizedBox(height: 20),
                          SelectField<String>(
                            label: 'Status',
                            value: _selectedStatus,
                            hintText: 'Select status',
                            options: _statuses,
                            itemLabelBuilder: (s) =>
                                s[0].toUpperCase() + s.substring(1),
                            onChanged: (v) =>
                                setState(() => _selectedStatus = v!),
                          ),
                          const SizedBox(height: 20),
                          TextInputField(
                            label: 'Notes',
                            controller: _notesController,
                            hintText: 'Additional notes',
                            maxLines: 3,
                          ),
                          const SizedBox(height: 20),
                          Padding(
                            padding: const EdgeInsets.only(left: 4),
                            child: Text(
                              'Assigned To',
                              style: AppTextStyles.label.copyWith(
                                color: AppColors.text(context, isMuted: true),
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          (() {
                            if (membersState == null || (membersState.isHydrating && !membersState.hasData)) {
                              return const Center(
                                child: SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                ),
                              );
                            }
                            if (membersState.error != null && !membersState.hasData) {
                              return const Text('Error loading members');
                            }
                            final members = membersState.data ?? [];
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: members.map((member) {
                                final isSelected = _selectedAssignedTo.contains(
                                  member.id,
                                );
                                return Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: GestureDetector(
                                    onTap: () {
                                      setState(() {
                                        if (isSelected) {
                                          _selectedAssignedTo.remove(member.id);
                                        } else {
                                          _selectedAssignedTo.add(member.id);
                                        }
                                      });
                                    },
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 14,
                                        vertical: 6,
                                      ),
                                      decoration: BoxDecoration(
                                        color: AppColors.surface(
                                          context,
                                          level: 2,
                                        ),
                                        border: Border.all(
                                          color: AppColors.borderColor(context),
                                        ),
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: Row(
                                        children: [
                                          KovariAvatar(
                                            imageUrl: member.avatar,
                                            fullName: member.name,
                                            size: 30,
                                          ),
                                          const SizedBox(width: 12),
                                          Expanded(
                                            child: Text(
                                              member.name,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: AppTextStyles.bodySmall
                                                  .copyWith(
                                                    color: AppColors.text(
                                                      context,
                                                    ),
                                                    fontWeight: FontWeight.w500,
                                                    fontSize: 13,
                                                  ),
                                            ),
                                          ),
                                          if (isSelected)
                                            const Icon(
                                              LucideIcons.check,
                                              size: 18,
                                              color: AppColors.primary,
                                            ),
                                        ],
                                      ),
                                    ),
                                  ),
                                );
                              }).toList(),
                            );
                          })(),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          // const SizedBox(height: 20),
          Divider(height: 1, color: AppColors.borderColor(context)),
          // const SizedBox(height: 20),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 20),
            child: Row(
              children: [
                Expanded(
                  child: SecondaryButton(
                    text: 'Cancel',
                    onPressed: () => context.pop(),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: PrimaryButton(
                    text: widget.initialItem == null
                        ? 'Add Item'
                        : 'Update Item',
                    onPressed: _submit,
                    isLoading: _isSubmitting,
                  ),
                ),
              ],
            ),
          ),
          SizedBox(height: MediaQuery.of(context).padding.bottom),
        ],
      ),
    );
  }
}

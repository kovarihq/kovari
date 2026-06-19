import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:mobile/core/theme/app_colors.dart';

class UserAvatarFallback extends StatelessWidget {
  const UserAvatarFallback({
    super.key,
    this.size,
    this.iconColor,
    this.backgroundColor,
    this.name,
    this.shape = BoxShape.circle,
    this.borderRadius,
    this.fontSize,
  });
  final double? size;
  final Color? iconColor;
  final Color? backgroundColor;
  final String? name;
  final BoxShape shape;
  final BorderRadius? borderRadius;
  final double? fontSize;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      // Use the smaller of available dimensions for internal scaling
      // fallback to a reasonable default (40) if constraints are infinite
      final width = constraints.maxWidth != double.infinity
          ? constraints.maxWidth
          : (size ?? 40);
      final height = constraints.maxHeight != double.infinity
          ? constraints.maxHeight
          : (size ?? 40);

      final effectiveSize = (size != null && size != double.infinity)
          ? size!
          : (width < height ? width : height);

      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: backgroundColor ?? AppColors.secondaryColor(context),
          shape: shape,
          border: Border.all(color: AppColors.borderColor(context)),
          borderRadius: borderRadius,
        ),
        child: Center(
          child: (name != null && name!.isNotEmpty)
              ? Text(
                  name![0].toUpperCase(),
                  style: TextStyle(
                    color: iconColor ?? AppColors.text(context, isMuted: true),
                    fontSize: fontSize ?? (effectiveSize * 0.45),
                    fontWeight: FontWeight.bold,
                  ),
                )
              : SizedBox(
                  width: effectiveSize * 0.6,
                  height: effectiveSize * 0.6,
                  child: SvgPicture.string(
                    '''
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="8" r="4" fill="currentColor" />
  <rect x="4" y="14" width="16" height="6" rx="3" fill="currentColor" />
</svg>
''',
                    colorFilter: ColorFilter.mode(
                      iconColor ?? AppColors.text(context, isMuted: true),
                      BlendMode.srcIn,
                    ),
                  ),
                ),
        ),
      );
    },
  );
}
